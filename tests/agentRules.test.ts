import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(import.meta.dirname, "..");

function spans(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].flatMap((match) => match[1] ?? []);
}

async function contents(path: string): Promise<string | null> {
  try {
    const info = await stat(join(ROOT, path));
    return info.isFile() ? await readFile(join(ROOT, path), "utf8") : "";
  } catch {
    return null;
  }
}

async function ruleTableProblems(markdown: string): Promise<string[]> {
  const section = markdown.split("\n## ")[1] ?? "";
  const rows = section
    .split("\n")
    .filter((line) => line.startsWith("| "))
    .slice(2);
  assert.ok(rows.length > 0, "AGENTS.md has a rule table");
  const problems: string[] = [];
  for (const row of rows) {
    const [rule = "", check = "", where = ""] = row
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const checks = spans(check);
    const paths = spans(where);
    if (checks.length === 0 || paths.length === 0)
      problems.push(`${rule}: name a check and the files that hold it.`);
    const files = await Promise.all(paths.map(contents));
    paths.forEach((path, index) => {
      if (files[index] === null) problems.push(`${rule}: ${path} is missing.`);
    });
    const text = files.join("\n");
    for (const name of checks)
      if (!text.includes(name))
        problems.push(`${rule}: no file in ${paths.join(", ")} has ${name}.`);
  }
  return problems;
}

const agents = await readFile(join(ROOT, "AGENTS.md"), "utf8");

await test("every rule in AGENTS.md names a check that exists", async () => {
  assert.deepEqual(await ruleTableProblems(agents), []);
});

await test("a rule that names a deleted file or a missing check fails", async () => {
  const rule = "Each release note is in the notes file.";
  const stale = [
    "# Agent instructions",
    "## Rules and checks",
    "| Rule | Check | Where | Past mistake |",
    "| --- | --- | --- | --- |",
    `| ${rule} | \`NOTE_FILE\`, \`uniqueNoteIds\` | \`releases/pending.json\` | #68 |`,
  ].join("\n");
  assert.deepEqual(await ruleTableProblems(stale), [
    `${rule}: releases/pending.json is missing.`,
    `${rule}: no file in releases/pending.json has NOTE_FILE.`,
    `${rule}: no file in releases/pending.json has uniqueNoteIds.`,
  ]);
});
