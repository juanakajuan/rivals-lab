import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { PendingNote, Release } from "../src/releases.ts";

function text(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !value) {
    throw new Error("Release values must be nonempty, trimmed strings.");
  }
  return value;
}

function unique(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate release or note ID.");
}

export function parseReleases(value: unknown): Release[] {
  if (!Array.isArray(value)) throw new Error("Expected a release array.");
  const releases = value.map((item: unknown): Release => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      !("date" in item) ||
      !("notes" in item)
    ) {
      throw new Error("Invalid release record.");
    }
    const date = text(item.date);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    ) {
      throw new Error("Invalid UTC release date.");
    }
    const [first, ...rest] = parsePending(item.notes);
    if (first === undefined)
      throw new Error("Each release needs at least one note.");
    return { id: text(item.id), date, notes: [first, ...rest] };
  });
  unique(releases.map((release) => release.id));
  unique(releases.flatMap((release) => release.notes.map((note) => note.id)));
  for (let index = 1; index < releases.length; index++) {
    const newer = releases[index - 1];
    const older = releases[index];
    if (newer && older && newer.date < older.date)
      throw new Error("Releases must be latest first.");
  }
  return releases;
}

export function parsePending(value: unknown): PendingNote[] {
  if (!Array.isArray(value)) throw new Error("Expected a pending note array.");
  const notes = value.map((item: unknown): PendingNote => {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      !("text" in item)
    )
      throw new Error("Invalid pending note.");
    return { id: text(item.id), text: text(item.text) };
  });
  unique(notes.map((note) => note.id));
  return notes;
}

async function readJson(path: string): Promise<unknown> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  return value;
}

async function saveJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

export async function readReleaseFeed(root: string): Promise<Release[]> {
  return parseReleases(
    await readJson(
      process.env["RIVALS_RELEASE_CANDIDATE"] ??
        join(root, "releases", "published.json"),
    ),
  );
}

export async function lockBuildOutput(
  root: string,
): Promise<() => Promise<void>> {
  const state = join(root, ".release");
  const lock = join(state, "deploy.lock");
  const token = process.env["RIVALS_RELEASE_TOKEN"];
  if (token !== undefined) {
    if ((await readFile(join(lock, "token"), "utf8")) !== token)
      throw new Error("Candidate build does not own the deployment lock.");
    return () => Promise.resolve();
  }
  await mkdir(state, { recursive: true });
  await mkdir(lock);
  let cleanup: Promise<void> | undefined;
  return () => (cleanup ??= rm(lock, { recursive: true, force: true }));
}

interface Command {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

export type CommandRunner = (command: Command) => Promise<void>;

const runCommand: CommandRunner = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`${command.executable} failed with ${signal ?? code}.`),
        );
    });
  });

const git = promisify(execFile);
const RELEASE_FILES = ["releases/pending.json", "releases/published.json"];

export type ReleaseCommitter = (root: string) => Promise<void>;

export const commitReleaseFiles: ReleaseCommitter = async (root) => {
  const { stdout } = await git(
    "git",
    ["status", "--porcelain", "--", ...RELEASE_FILES],
    { cwd: root },
  );
  if (stdout.trim() === "") return;
  await git("git", ["add", "--", ...RELEASE_FILES], { cwd: root });
  await git(
    "git",
    [
      "commit",
      "-m",
      "chore(releases): publish release notes",
      "--",
      ...RELEASE_FILES,
    ],
    { cwd: root },
  );
};

async function tryCommit(root: string, commit?: ReleaseCommitter) {
  if (!commit) return;
  try {
    await commit(root);
  } catch (error) {
    console.warn(
      `Release files were published but not committed: ${String(error)}\nCommit ${RELEASE_FILES.join(" and ")} manually.`,
    );
  }
}

async function verifyLive(
  releases: readonly Release[],
  id: string,
): Promise<void> {
  const response = await fetch(
    `https://rivals-lab.juanix.workers.dev/release-manifest.json?release=${randomUUID()}`,
    { cache: "no-store" },
  );
  if (!response.ok)
    throw new Error(
      `Live release verification failed with HTTP ${response.status}.`,
    );
  const value: unknown = await response.json();
  if (
    typeof value !== "object" ||
    value === null ||
    !("releaseId" in value) ||
    value.releaseId !== id ||
    !("releases" in value) ||
    JSON.stringify(parseReleases(value.releases)) !== JSON.stringify(releases)
  )
    throw new Error(
      "The live release manifest does not match this deployment. Verify the receipt before recovery.",
    );
}

interface DeployOptions {
  readonly root: string;
  readonly run?: CommandRunner;
  readonly verify?: (releases: readonly Release[], id: string) => Promise<void>;
  readonly now?: Date;
  readonly commit?: ReleaseCommitter;
}

export async function deployRelease({
  root,
  run = runCommand,
  verify = verifyLive,
  now = new Date(),
  commit,
}: DeployOptions): Promise<void> {
  const state = join(root, ".release");
  await mkdir(state, { recursive: true });
  const lock = join(state, "deploy.lock");
  await mkdir(lock);
  try {
    const receipt = join(state, "receipt.json");
    try {
      await readFile(receipt);
      throw new Error(
        "An unresolved release receipt exists. Verify it, then use deploy:confirm or deploy:discard.",
      );
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    const published = parseReleases(
      await readJson(join(root, "releases", "published.json")),
    );
    const pending = parsePending(
      await readJson(join(root, "releases", "pending.json")),
    );
    const known = new Set(
      published.flatMap((release) => release.notes.map((note) => note.id)),
    );
    const fresh = pending.filter((note) => !known.has(note.id));
    const [first, ...rest] = fresh;
    const id = randomUUID();
    const date = now.toISOString().slice(0, 10);
    if (published.some((release) => release.date > date))
      throw new Error("Release date precedes published history.");
    const candidate: Release[] = first
      ? [{ id, date, notes: [first, ...rest] }, ...published]
      : published;
    const directory = join(state, id);
    await mkdir(directory);
    const candidatePath = join(directory, "releases.json");
    await saveJson(candidatePath, candidate);
    await writeFile(join(lock, "token"), id);
    const env = {
      ...process.env,
      RIVALS_RELEASE_CANDIDATE: candidatePath,
      RIVALS_RELEASE_TOKEN: id,
    };
    await run({
      executable: "npm",
      args: ["run", "build", "--", "--mode", "production"],
      cwd: root,
      env,
    });
    await cp(
      join(root, ".cloudflare", "output", "v0"),
      join(directory, "output"),
      { recursive: true },
    );
    await saveJson(receipt, {
      id,
      releases: candidate,
      previous: published,
      pending,
    });
    await run({
      executable: "npx",
      args: ["cf", "deploy", "--prebuilt", "--mode", "production"],
      cwd: root,
      env,
    });
    await verify(candidate, id);
    await promote(root, candidate, published, pending);
    await rm(receipt);
    await rm(directory, { recursive: true });
    await tryCommit(root, commit);
  } finally {
    await rm(lock, { recursive: true });
  }
}

async function promote(
  root: string,
  releases: readonly Release[],
  previous: readonly Release[],
  pending: readonly PendingNote[],
): Promise<void> {
  const publishedPath = join(root, "releases", "published.json");
  const published = parseReleases(await readJson(publishedPath));
  if (
    JSON.stringify(published) !== JSON.stringify(previous) &&
    JSON.stringify(published) !== JSON.stringify(releases)
  )
    throw new Error(
      "Published history changed during deployment. Restore or reconcile it before confirming the receipt.",
    );
  const pendingPath = join(root, "releases", "pending.json");
  const current = parsePending(await readJson(pendingPath));
  await saveJson(publishedPath, releases);
  await saveJson(
    pendingPath,
    current.filter(
      (note) =>
        !pending.some(
          (included) => included.id === note.id && included.text === note.text,
        ),
    ),
  );
}

export async function recoverRelease(
  root: string,
  action: "confirm" | "discard",
  commit?: ReleaseCommitter,
): Promise<void> {
  const state = join(root, ".release");
  const lock = join(state, "deploy.lock");
  await mkdir(lock);
  try {
    const receiptPath = join(state, "receipt.json");
    const value = await readJson(receiptPath);
    if (
      typeof value !== "object" ||
      value === null ||
      !("id" in value) ||
      !("releases" in value) ||
      !("previous" in value) ||
      !("pending" in value)
    )
      throw new Error("Invalid release receipt.");
    const id = text(value.id);
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid receipt ID.");
    const releases = parseReleases(value.releases);
    const pending = parsePending(value.pending);
    const previous = parseReleases(value.previous);
    if (action === "confirm") {
      await verifyLive(releases, id);
      await promote(root, releases, previous, pending);
    }
    await rm(receiptPath);
    await rm(join(state, id), { recursive: true });
    if (action === "confirm") await tryCommit(root, commit);
  } finally {
    await rm(lock, { recursive: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const action = process.argv[2];
  if (action === "--confirm")
    await recoverRelease(process.cwd(), "confirm", commitReleaseFiles);
  else if (action === "--discard")
    await recoverRelease(process.cwd(), "discard");
  else if (action === undefined)
    await deployRelease({ root: process.cwd(), commit: commitReleaseFiles });
  else throw new Error("Use no argument, --confirm, or --discard.");
}
