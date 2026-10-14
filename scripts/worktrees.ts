import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

interface Worktree {
  path: string;
  head: string;
  branch: string | undefined;
  locked: boolean;
}

interface PullRequest {
  state: "OPEN" | "CLOSED" | "MERGED";
  headRefOid: string;
}

const USAGE = "Usage: npm run worktrees:clean [-- --dry-run]";

function run(command: string, args: readonly string[], cwd?: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function succeeds(args: readonly string[]): boolean {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function listWorktrees(): Worktree[] {
  return run("git", ["worktree", "list", "--porcelain"])
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n");
      const field = (name: string): string | undefined =>
        lines
          .find((line) => line === name || line.startsWith(`${name} `))
          ?.slice(name.length + 1);
      const path = field("worktree");
      if (path === undefined) throw new Error(`Bad worktree entry:\n${block}`);
      return {
        path,
        head: field("HEAD") ?? "",
        branch: field("branch")?.replace(/^refs\/heads\//, ""),
        locked: field("locked") !== undefined,
      };
    });
}

function isPullRequest(value: unknown): value is PullRequest {
  if (typeof value !== "object" || value === null) return false;
  if (!("state" in value) || !("headRefOid" in value)) return false;
  const { state, headRefOid } = value;
  return (
    (state === "OPEN" || state === "CLOSED" || state === "MERGED") &&
    typeof headRefOid === "string"
  );
}

function pullRequestsByHead(): Map<string, PullRequest["state"]> {
  const json: unknown = JSON.parse(
    run("gh", [
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "1000",
      "--json",
      "state,headRefOid",
    ]),
  );
  if (!Array.isArray(json) || !json.every(isPullRequest)) {
    throw new Error("gh pr list returned an unexpected shape.");
  }
  return new Map(json.map((pr) => [pr.headRefOid, pr.state]));
}

function staleReason(
  worktree: Worktree,
  pullRequests: ReadonlyMap<string, PullRequest["state"]>,
): string | undefined {
  const state = pullRequests.get(worktree.head);
  if (state === "MERGED" || state === "CLOSED") {
    return `PR ${state.toLowerCase()}`;
  }
  if (succeeds(["merge-base", "--is-ancestor", worktree.head, "origin/main"])) {
    return "no commits beyond origin/main";
  }
  return undefined;
}

function clean(dryRun: boolean): void {
  run("git", ["fetch", "--quiet", "origin"]);
  const pullRequests = pullRequestsByHead();
  const current = run("git", ["rev-parse", "--show-toplevel"]);
  const [main, ...others] = listWorktrees();
  if (!main) throw new Error("git worktree list returned nothing.");

  for (const worktree of others) {
    const label = `${worktree.path} (${worktree.branch ?? worktree.head.slice(0, 7)})`;
    if (!existsSync(worktree.path)) {
      console.log(`prune   ${label}: folder is missing`);
      continue;
    }
    if (worktree.path === current) {
      console.log(`keep    ${label}: current worktree`);
      continue;
    }
    if (worktree.locked) {
      console.log(`keep    ${label}: locked`);
      continue;
    }
    if (run("git", ["status", "--porcelain"], worktree.path) !== "") {
      console.log(`keep    ${label}: uncommitted changes`);
      continue;
    }
    const reason = staleReason(worktree, pullRequests);
    if (reason === undefined) {
      console.log(`keep    ${label}: active work`);
      continue;
    }
    console.log(`remove  ${label}: ${reason}`);
    if (dryRun) continue;
    run("git", ["worktree", "remove", worktree.path]);
    if (worktree.branch) run("git", ["branch", "-D", worktree.branch]);
  }

  if (!dryRun) run("git", ["worktree", "prune"]);
  if (dryRun) console.log("\nDry run. Nothing was removed.");
}

const args = process.argv.slice(2);
if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) {
  clean(args[0] === "--dry-run");
} else {
  console.error(USAGE);
  process.exitCode = 2;
}
