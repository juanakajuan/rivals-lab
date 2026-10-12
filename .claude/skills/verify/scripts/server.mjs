#!/usr/bin/env node
// Usage: server.mjs up | doctor | down
// Starts a private Vite dev server for verification. State lives in ../.run (gitignored).
import { spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..", "..");
const runDir = join(here, "..", ".run");
const pidFile = join(runDir, "server.pid");
const portFile = join(runDir, "server.port");
const logFile = join(runDir, "server.log");
const port = Number(process.env.VERIFY_PORT ?? "4181");
const url = `http://127.0.0.1:${port}`;

async function probe() {
  try {
    const res = await fetch(`${url}/board`);
    const html = await res.text();
    return { ok: res.ok, vite: html.includes("/@vite/client") };
  } catch {
    return { ok: false, vite: false };
  }
}

function readPid() {
  try {
    return Number(readFileSync(pidFile, "utf8"));
  } catch {
    return null;
  }
}

const cmd = process.argv[2];
if (cmd === "up") {
  const before = await probe();
  if (before.ok && readPid() === null) {
    console.error(`Port ${port} is answering but this run did not start it. Set VERIFY_PORT to a free port.`);
    process.exit(1);
  }
  if (!before.ok) {
    mkdirSync(runDir, { recursive: true });
    const log = openSync(logFile, "w");
    const child = spawn(
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      { cwd: root, detached: true, stdio: ["ignore", log, log] },
    );
    child.unref();
    writeFileSync(pidFile, String(child.pid));
    writeFileSync(portFile, String(port));
    for (let i = 0; i < 120; i++) {
      if ((await probe()).ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const after = await probe();
  if (!after.ok) {
    console.error(`Server did not become ready. See ${logFile}`);
    process.exit(1);
  }
  console.log(url);
} else if (cmd === "doctor") {
  const pid = readPid();
  const state = await probe();
  const problems = [];
  if (pid === null) problems.push("no server.pid: this run did not start the server");
  if (!state.ok) problems.push(`${url}/board does not answer`);
  if (state.ok && !state.vite) problems.push("page is not served by the Vite dev server");
  console.log(JSON.stringify({ url, pid, ...state, problems }, null, 2));
  process.exit(problems.length ? 1 : 0);
} else if (cmd === "down") {
  const pid = readPid();
  if (pid !== null) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  rmSync(pidFile, { force: true });
  rmSync(portFile, { force: true });
  console.log("stopped");
} else {
  console.error("Usage: server.mjs up | doctor | down");
  process.exit(2);
}
