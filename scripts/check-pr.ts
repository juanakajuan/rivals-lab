import { execFile } from "node:child_process";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

export type PullRequest = {
  title: string;
  body: string;
  files: readonly string[];
};

export type RuleId = "test" | "media" | "agents";

export type Failure = {
  rule: RuleId;
  files: string[];
  message: string;
};

type Rule = {
  id: RuleId;
  problem: string;
  covers: (path: string) => boolean;
  satisfied: (pr: PullRequest) => boolean;
  fix: string;
};

const MEDIA_LINK =
  /https:\/\/(github\.com\/user-attachments\/(assets|files)\/|(private-)?user-images\.githubusercontent\.com\/)/;

function hasLine(body: string, pattern: RegExp): boolean {
  return body.split(/\r?\n/).some((line) => pattern.test(line.trim()));
}

function titleScopes(title: string): string[] {
  const scope = /^[a-z]+\(([^)]*)\)!?:/i.exec(title.trim())?.[1];
  return scope === undefined ? [] : scope.split(",").map((s) => s.trim());
}

const RULES: readonly Rule[] = [
  {
    id: "test",
    problem: "Source code changed with no change under tests/",
    covers: (path) =>
      path.startsWith("src/") && /\.(ts|tsx|js|jsx|mjs)$/.test(path),
    satisfied: (pr) =>
      pr.files.some((path) => path.startsWith("tests/")) ||
      hasLine(pr.body, /^no-test:\s*\S/i),
    fix: 'Add or change a test under tests/ that fails without this change. If no test can prove it, add the line "no-test: <reason>" to the PR body.',
  },
  {
    id: "media",
    problem: "Visible UI files changed with no media link in the PR body",
    covers: (path) => /\.(tsx|css)$/.test(path),
    satisfied: (pr) =>
      MEDIA_LINK.test(pr.body) || hasLine(pr.body, /^No visible change\b/i),
    fix: 'Capture before and after screenshots or video, run "npm run media:upload -- <PR URL> <files>", and put the links in the PR body. If the UI does not change, add the line "No visible change" to the PR body.',
  },
  {
    id: "agents",
    problem: "Agent instruction files changed without the agents scope",
    covers: (path) =>
      path.startsWith(".claude/") ||
      ["AGENTS.md", "CLAUDE.md"].includes(basename(path)),
    satisfied: (pr) => titleScopes(pr.title).includes("agents"),
    fix: 'Put the scope "agents" in the PR title, for example "docs(agents): <summary>". If these changes are not intended, remove them from this PR.',
  },
];

export function checkPullRequest(pr: PullRequest): Failure[] {
  return RULES.flatMap((rule) => {
    const files = pr.files.filter(rule.covers);
    if (files.length === 0 || rule.satisfied(pr)) return [];
    return [
      {
        rule: rule.id,
        files,
        message: `${rule.problem}: ${files.join(", ")}. ${rule.fix}`,
      },
    ];
  });
}

const run = promisify(execFile);

function parseDetails(json: string): { title: string; body: string } {
  const value: unknown = JSON.parse(json);
  if (
    typeof value === "object" &&
    value !== null &&
    "title" in value &&
    "body" in value &&
    typeof value.title === "string" &&
    typeof value.body === "string"
  )
    return { title: value.title, body: value.body };
  throw new Error("gh pr view returned no string title and body.");
}

async function readPullRequest(number: string): Promise<PullRequest> {
  const [details, files] = await Promise.all([
    run("gh", ["pr", "view", number, "--json", "title,body"]),
    run("gh", [
      "api",
      "--paginate",
      `repos/{owner}/{repo}/pulls/${number}/files`,
      "--jq",
      ".[] | .filename, (.previous_filename // empty)",
    ]),
  ]);
  return {
    ...parseDetails(details.stdout),
    files: files.stdout.split("\n").filter((path) => path !== ""),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const number = process.argv[2];
  if (number === undefined || !/^\d+$/.test(number))
    throw new Error("Usage: npm run check:pr -- <PR number>");
  const failures = checkPullRequest(await readPullRequest(number));
  for (const failure of failures) console.error(`::error::${failure.message}`);
  if (failures.length > 0) process.exitCode = 1;
  else console.log(`PR #${number} follows the PR rules.`);
}
