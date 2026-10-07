import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { connect, createServer } from "node:net";
import { dirname, resolve, sep } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../../..");
const defaultRunDir = resolve(scriptDir, "../.run");
const evidenceRoot = resolve(repoRoot, "artifacts/verify");
const actionTimeout = 10_000;
const navigationTimeout = 60_000;
const readyTitle = "<title>Position Board | Rivals Lab</title>";

function die(message) {
  console.error(message);
  process.exit(1);
}

function runDir() {
  return process.env["RIVALS_VERIFY_RUN"]
    ? resolve(process.env["RIVALS_VERIFY_RUN"])
    : defaultRunDir;
}

function statePath() {
  return resolve(runDir(), "state.json");
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath(), "utf8"));
  } catch (error) {
    if (isEnoent(error)) return null;
    throw error;
  }
}

function writeState(state) {
  mkdirSync(runDir(), { recursive: true });
  const next = `${statePath()}.next`;
  writeFileSync(next, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(next, statePath());
}

function isEnoent(error) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT",
  );
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function cmdline(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
  } catch {
    return "";
  }
}

function ppid(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
  const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  return Number(rest[1]);
}

function descendants(rootPid) {
  const parents = new Map();
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      parents.set(pid, ppid(pid));
    } catch {
      // The process can exit while /proc is being scanned.
    }
  }
  const found = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, parent] of parents) {
      if (found.has(parent) && !found.has(pid)) {
        found.add(pid);
        grew = true;
      }
    }
  }
  return found;
}

function listenInodes(port) {
  const suffix = `:${port.toString(16).padStart(4, "0")}`;
  const inodes = [];
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.trim().split("\n").slice(1)) {
      const fields = line.trim().split(/\s+/);
      const local = fields[1]?.toLowerCase();
      const state = fields[3];
      const inode = fields[9];
      if (state === "0A" && local?.endsWith(suffix) && inode)
        inodes.push(inode);
    }
  }
  return inodes;
}

function pidsHoldingInodes(pids, inodes) {
  const wanted = new Set(inodes);
  const holders = [];
  for (const pid of pids) {
    let fds;
    try {
      fds = readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        const link = readlinkSync(`/proc/${pid}/fd/${fd}`);
        const match = /^socket:\[(\d+)\]$/.exec(link);
        if (match?.[1] && wanted.has(match[1])) holders.push(pid);
      } catch {
        // File descriptors disappear as the process runs.
      }
    }
  }
  return holders;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    die("RIVALS_VERIFY_PORT must be an integer from 1 to 65535.");
  return port;
}

function scratchFor(dir) {
  const id = createHash("sha256").update(dir).digest("hex").slice(0, 12);
  return `/tmp/rivals-lab-verify-${id}`;
}

function evidencePath(rel) {
  if (!rel || rel.startsWith("--"))
    die("Pass an evidence path under artifacts/verify/.");
  const abs = resolve(repoRoot, rel);
  if (abs !== evidenceRoot && !abs.startsWith(`${evidenceRoot}${sep}`))
    die(`Evidence path must stay under artifacts/verify/: ${rel}`);
  return abs;
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = "true";
    else {
      flags[key] = next;
      index += 1;
    }
  }
  return { positional, flags };
}

function describe(flags) {
  const parts = [];
  if (flags["role"]) parts.push(`role=${flags["role"]}`);
  if (flags["name"]) parts.push(`name=${JSON.stringify(flags["name"])}`);
  if (flags["name-pattern"])
    parts.push(`name-pattern=${flags["name-pattern"]}`);
  if (flags["label"]) parts.push(`label=${JSON.stringify(flags["label"])}`);
  if (flags["text"]) parts.push(`text=${JSON.stringify(flags["text"])}`);
  return parts.join(" ") || "locator";
}

function locator(page, flags) {
  if (flags["label"]) return page.getByLabel(flags["label"], { exact: true });
  if (flags["text"]) return page.getByText(flags["text"], { exact: true });
  if (!flags["role"])
    throw new Error(`Pass --role, --label, or --text (${describe(flags)}).`);
  if (flags["name-pattern"])
    return page.getByRole(flags["role"], {
      name: new RegExp(flags["name-pattern"]),
    });
  if (!flags["name"])
    throw new Error("Pass --name or --name-pattern with --role.");
  return page.getByRole(flags["role"], { name: flags["name"], exact: true });
}

async function waitForCount(target, expected) {
  const started = Date.now();
  let count = await target.count();
  while (count !== expected && Date.now() - started < actionTimeout) {
    await delay(100);
    count = await target.count();
  }
  if (count !== expected)
    throw new Error(`expected ${expected} match(es), found ${count}`);
  return count;
}

function send(socketPath, command) {
  return new Promise((resolveResult, reject) => {
    const socket = connect(socketPath);
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("verification driver timed out"));
    }, navigationTimeout);
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      clearTimeout(timer);
      socket.end();
      try {
        resolveResult(JSON.parse(buffer.slice(0, newline)));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("connect", () => {
      socket.write(`${JSON.stringify(command)}\n`);
    });
  });
}

function requirePackage() {
  const pkg = JSON.parse(
    readFileSync(resolve(repoRoot, "package.json"), "utf8"),
  );
  if (pkg.name !== "rivals-lab")
    die(`Verifier is not inside the rivals-lab checkout: ${repoRoot}`);
}

async function portFree(port) {
  const { createServer: listen } = await import("node:net");
  return new Promise((resolveFree) => {
    const server = listen();
    server.once("error", () => resolveFree(false));
    server.once("listening", () => {
      server.close(() => resolveFree(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function waitForServer(url, serverPid, logPath) {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (!alive(serverPid)) {
      throw new Error(
        `Dev server exited before it was ready.\n${tail(logPath)}`,
      );
    }
    try {
      const response = await fetch(url);
      const html = await response.text();
      if (response.ok && html.includes(readyTitle)) return;
    } catch {
      // Vite is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}\n${tail(logPath)}`);
}

function tail(file) {
  try {
    const text = readFileSync(file, "utf8");
    return text.slice(-4000);
  } catch {
    return "";
  }
}

function spawnLogged(command, args, logPath) {
  mkdirSync(dirname(logPath), { recursive: true });
  const logFd = openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env: process.env,
  });
  child.unref();
  closeSync(logFd);
  if (!child.pid) die(`Could not start ${command}`);
  return child.pid;
}

async function stopPid(pid, expected) {
  if (!alive(pid)) return "already stopped";
  const command = cmdline(pid);
  if (expected && !command.includes(expected))
    return `left pid ${pid} alone because its command is ${JSON.stringify(command)}`;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return "already stopped";
    }
  }
  for (let attempt = 0; attempt < 20 && alive(pid); attempt += 1)
    await delay(100);
  if (alive(pid)) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // The process exited between the checks.
      }
    }
  }
  return `stopped pid ${pid}`;
}

async function stopProfileProcesses(profileDir) {
  let entries;
  try {
    entries = readdirSync("/proc");
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (!cmdline(pid).includes(profileDir)) continue;
    console.log(await stopPid(pid, profileDir));
  }
}

async function cleanup() {
  const state = readState();
  if (!state) {
    console.log("no verification instance");
    return;
  }
  if (state.socketPath) {
    try {
      const result = await send(state.socketPath, { cmd: "shutdown" });
      if (!result.ok && result.error) console.error(result.error);
    } catch {
      // The driver is already gone. The pid stop below is the fallback.
    }
  }
  if (state.driverPid)
    console.log(await stopPid(state.driverPid, "verify.mjs"));
  if (state.profileDir) await stopProfileProcesses(state.profileDir);
  if (state.serverPid) console.log(await stopPid(state.serverPid, "npm"));
  if (state.scratchDir)
    rmSync(state.scratchDir, { recursive: true, force: true });
  rmSync(runDir(), { recursive: true, force: true });
  console.log("evidence kept in artifacts/verify/");
}

async function launch() {
  requirePackage();
  const existing = readState();
  if (existing && (alive(existing.serverPid) || alive(existing.driverPid))) {
    die(
      `A verification instance is already running at ${existing.url}. Run cleanup before launching another one in this run directory.`,
    );
  }
  if (existing) {
    if (existing.scratchDir)
      rmSync(existing.scratchDir, { recursive: true, force: true });
    rmSync(runDir(), { recursive: true, force: true });
  }
  const port = parsePort(process.env["RIVALS_VERIFY_PORT"] ?? "4183");
  if (!(await portFree(port)))
    die(
      `Port ${port} is already in use. Leave that process alone and set RIVALS_VERIFY_PORT to a free port.`,
    );
  const url = `http://127.0.0.1:${port}`;
  const scratchDir = scratchFor(runDir());
  rmSync(scratchDir, { recursive: true, force: true });
  mkdirSync(scratchDir, { recursive: true });
  const socketPath = `${scratchDir}/driver.sock`;
  const profileDir = `${scratchDir}/profile`;
  const serverLog = resolve(runDir(), "server.log");
  const driverLog = resolve(runDir(), "driver.log");
  mkdirSync(runDir(), { recursive: true });
  const serverPid = spawnLogged(
    "npm",
    [
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    serverLog,
  );
  const state = {
    port,
    url,
    repoRoot,
    serverPid,
    driverPid: null,
    socketPath,
    profileDir,
    scratchDir,
    serverLog,
    driverLog,
  };
  writeState(state);
  try {
    await waitForServer(url, serverPid, serverLog);
    state.driverPid = spawnLogged(
      process.execPath,
      [fileURLToPath(import.meta.url), "driver"],
      driverLog,
    );
    writeState(state);
    const started = Date.now();
    let ready = null;
    while (Date.now() - started < 60_000) {
      if (!alive(state.driverPid))
        throw new Error(`Verification driver exited.\n${tail(driverLog)}`);
      try {
        const result = await send(socketPath, { cmd: "ping" });
        if (result.ok) {
          ready = result;
          break;
        }
      } catch {
        // The driver is still opening Chromium.
      }
      await delay(250);
    }
    if (!ready)
      throw new Error(`Timed out waiting for the browser.\n${tail(driverLog)}`);
    console.log(`ready ${url}`);
    console.log(`title ${ready.title}`);
    console.log(`profile ${profileDir}`);
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function serverOwnsPort(state) {
  const inodes = listenInodes(state.port);
  if (!inodes.length) return "nothing is listening on the verification port";
  const holders = pidsHoldingInodes(descendants(state.serverPid), inodes);
  if (!holders.length)
    return `port ${state.port} is not owned by the verification server pid ${state.serverPid}`;
  return "";
}

async function doctor() {
  requirePackage();
  const state = readState();
  if (!state) die("No verification instance. Run launch first.");
  if (!alive(state.serverPid)) die("Verification server pid is not running.");
  if (!cmdline(state.serverPid).includes("npm"))
    die("Verification server pid is no longer npm.");
  let cwd = "";
  try {
    cwd = readlinkSync(`/proc/${state.serverPid}/cwd`);
  } catch {
    die("Could not read the verification server working directory.");
  }
  if (cwd !== repoRoot)
    die(`Verification server cwd is ${cwd}, expected ${repoRoot}.`);
  const ownership = serverOwnsPort(state);
  if (ownership) die(ownership);
  const response = await fetch(state.url);
  const html = await response.text();
  if (!response.ok || !html.includes(readyTitle))
    die(`Expected the Rivals Lab dev page at ${state.url}.`);
  if (!alive(state.driverPid))
    die("Verification browser driver is not running.");
  const driven = await send(state.socketPath, { cmd: "doctor" });
  if (!driven.ok) die(driven.error ?? "Driver doctor failed.");
  if (driven.title !== "Position Board | Rivals Lab")
    die(`Unexpected page title ${JSON.stringify(driven.title)}.`);
  const currentUrl = String(driven.url);
  if (currentUrl !== state.url && !currentUrl.startsWith(`${state.url}/`))
    die(`Browser is at ${driven.url}, expected ${state.url}.`);
  if (driven.identity !== 1)
    die(`Expected one "Rivals Lab" label, found ${driven.identity}.`);
  console.log(
    `ok doctor url=${driven.url} title=${JSON.stringify(driven.title)} port=${state.port} server=${state.serverPid} profile=${state.profileDir}`,
  );
}

async function drive(argv) {
  const state = readState();
  if (!state?.socketPath || !alive(state.driverPid))
    die("No drivable verification instance. Run launch, then doctor.");
  const { positional, flags } = parseArgs(argv);
  const [name, path] = positional;
  if (!name) die("Pass a drive command.");
  const command = { cmd: name, ...flags };
  if (path) command.path = path;
  if (name === "snapshot" || name === "screenshot")
    command.path = evidencePath(flags["path"]);
  if (name === "set-input-files") {
    if (!flags["file"]) die("Pass --file for set-input-files.");
    command.file = resolve(repoRoot, flags["file"]);
  }
  const result = await send(state.socketPath, command);
  if (!result.ok) die(result.error ?? `${name} failed`);
  if (typeof result.text === "string") console.log(result.text);
  else if (typeof result.value === "string") console.log(result.value);
  else if (typeof result.url === "string" && name === "url")
    console.log(result.url);
  else if (result.dialog) console.log(`dialog ${result.dialog}`);
  else console.log(`ok ${name}`);
}

async function openApp(page, url) {
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: navigationTimeout,
  });
  await page.getByText("Rivals Lab", { exact: true }).waitFor({
    timeout: navigationTimeout,
  });
}

async function driver() {
  requirePackage();
  const state = readState();
  if (!state) die("Driver started without launch state.");
  const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"];
  const context = await chromium.launchPersistentContext(state.profileDir, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    args: ["--no-first-run", "--no-default-browser-check"],
    ...(executablePath ? { executablePath } : {}),
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(actionTimeout);
  page.setDefaultNavigationTimeout(navigationTimeout);
  await openApp(page, `${state.url}/`);
  let queue = Promise.resolve();
  const server = createServer((socket) => {
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        queue = queue.then(async () => {
          let result;
          try {
            result = await handle(page, state, JSON.parse(line));
          } catch (error) {
            result = {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
          await new Promise((resolveWrite) => {
            socket.write(`${JSON.stringify(result)}\n`, () => resolveWrite());
          });
          if (result.shutdown) {
            socket.end();
            server.close();
            await context.close();
            process.exit(0);
          }
        });
      }
    });
  });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(state.socketPath, () => resolveListen());
  });
}

async function handle(page, state, command) {
  switch (command.cmd) {
    case "ping":
    case "doctor":
      return {
        ok: true,
        url: page.url(),
        title: await page.title(),
        identity: await page.getByText("Rivals Lab", { exact: true }).count(),
      };
    case "shutdown":
      return { ok: true, shutdown: true };
    case "goto": {
      const path = command.path ?? "/";
      await openApp(page, new URL(path, state.url).href);
      return { ok: true, url: page.url() };
    }
    case "reload":
      await page.reload({
        waitUntil: "domcontentloaded",
        timeout: navigationTimeout,
      });
      await page.getByText("Rivals Lab", { exact: true }).waitFor({
        timeout: navigationTimeout,
      });
      return { ok: true, url: page.url() };
    case "url":
      return { ok: true, url: page.url() };
    case "press":
      if (!command.key) throw new Error("Pass --key.");
      await page.keyboard.press(command.key);
      return { ok: true };
    case "click":
    case "fill":
    case "text":
    case "assert-visible":
    case "assert-value":
    case "assert-count":
    case "assert-attribute":
    case "select":
    case "set-input-files":
    case "snapshot":
    case "screenshot":
      return act(page, command);
    default:
      throw new Error(`Unknown command ${JSON.stringify(command.cmd)}.`);
  }
}

async function act(page, command) {
  if (command.cmd === "snapshot") {
    const yaml = await page.locator("body").ariaSnapshot();
    mkdirSync(dirname(command.path), { recursive: true });
    writeFileSync(command.path, yaml);
    return { ok: true };
  }
  if (command.cmd === "screenshot") {
    mkdirSync(dirname(command.path), { recursive: true });
    await page.screenshot({ path: command.path, fullPage: true });
    return { ok: true };
  }
  const target = locator(page, command);
  if (command.cmd === "assert-count") {
    const count = Number(command.count);
    if (!Number.isInteger(count) || count < 0)
      throw new Error("Pass an integer --count.");
    await waitForCount(target, count);
    return { ok: true };
  }
  if (command.cmd === "set-input-files") {
    await waitForCount(target, 1);
    await target.setInputFiles(command.file);
    return { ok: true };
  }
  await waitForCount(target, 1);
  if (command.cmd === "click") {
    let dialog = "";
    const acceptDialog = (popup) => {
      dialog = popup.message();
      void popup.accept();
    };
    if (command["accept-dialog"] === "true") page.once("dialog", acceptDialog);
    try {
      await target.click();
    } finally {
      page.off("dialog", acceptDialog);
    }
    return dialog ? { ok: true, dialog } : { ok: true };
  }
  if (command.cmd === "fill") {
    if (typeof command.value !== "string") throw new Error("Pass --value.");
    await target.fill(command.value);
    return { ok: true };
  }
  if (command.cmd === "text")
    return { ok: true, text: await target.innerText() };
  if (command.cmd === "assert-visible") return { ok: true };
  if (command.cmd === "assert-value") {
    const value = await target.inputValue();
    if (value !== command.value)
      throw new Error(
        `expected value ${JSON.stringify(command.value)}, got ${JSON.stringify(value)}`,
      );
    return { ok: true, value };
  }
  if (command.cmd === "assert-attribute") {
    const actual = await target.getAttribute(command.attribute);
    if (actual !== command.value)
      throw new Error(
        `expected ${command.attribute}=${JSON.stringify(command.value)}, got ${JSON.stringify(actual)}`,
      );
    return { ok: true };
  }
  if (command.cmd === "select") {
    if (typeof command.value !== "string") throw new Error("Pass --value.");
    await target.selectOption(command.value);
    return { ok: true };
  }
  throw new Error(`Unhandled command ${command.cmd}.`);
}

const [action, ...rest] = process.argv.slice(2);

try {
  if (action === "launch") await launch();
  else if (action === "doctor") await doctor();
  else if (action === "cleanup") await cleanup();
  else if (action === "driver") await driver();
  else if (action) await drive([action, ...rest]);
  else
    die(
      "Usage: verify.mjs <launch|doctor|cleanup|goto|reload|click|fill|press|select|set-input-files|text|assert-visible|assert-value|assert-count|assert-attribute|snapshot|screenshot|url>",
    );
} catch (error) {
  die(error instanceof Error ? error.message : String(error));
}
