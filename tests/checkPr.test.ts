import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  checkPullRequest,
  type Failure,
  type PullRequest,
} from "../scripts/check-pr.ts";

async function openedPullRequest(number: number): Promise<PullRequest> {
  const value: unknown = JSON.parse(
    await readFile(
      new URL(
        `fixtures/pull-requests/pr-${number}-opened.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
  if (
    typeof value === "object" &&
    value !== null &&
    "title" in value &&
    "body" in value &&
    "files" in value &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    Array.isArray(value.files) &&
    value.files.every((file) => typeof file === "string")
  )
    return { title: value.title, body: value.body, files: value.files };
  throw new Error(`Fixture for PR #${number} is malformed.`);
}

function rules(failures: Failure[]): [string, string[]][] {
  return failures.map((failure) => [failure.rule, failure.files]);
}

const TEST_FIX =
  'Add or change a test under tests/ that fails without this change. If no test can prove it, add the line "no-test: <reason>" to the PR body.';
const MEDIA_FIX =
  'Capture before and after screenshots or video, run "npm run media:upload -- <PR URL> <files>", and put the links in the PR body. If the UI does not change, add the line "No visible change" to the PR body.';
const AGENTS_FIX =
  'Put the scope "agents" in the PR title, for example "docs(agents): <summary>". If these changes are not intended, remove them from this PR.';

await test("PR #88 as opened fails all three rules", async () => {
  const failures = checkPullRequest(await openedPullRequest(88));
  assert.deepEqual(rules(failures), [
    [
      "test",
      ["src/BuilderPanels.tsx", "src/Changelog.tsx", "src/compImage.ts"],
    ],
    ["media", ["src/BuilderPanels.tsx", "src/Changelog.tsx"]],
    [
      "agents",
      [
        ".claude/skills/verify/SKILL.md",
        ".claude/skills/verify/features/README.md",
        ".claude/skills/verify/features/changelog.md",
        ".claude/skills/verify/features/choose-map.md",
        ".claude/skills/verify/features/place-hero.md",
        ".claude/skills/verify/features/save-comp.md",
        ".claude/skills/verify/features/undo-board.md",
        ".claude/skills/verify/scripts/verify.mjs",
        "AGENTS.md",
      ],
    ],
  ]);
  assert.equal(
    failures[1]?.message,
    `Visible UI files changed with no media link in the PR body: src/BuilderPanels.tsx, src/Changelog.tsx. ${MEDIA_FIX}`,
  );
});

await test("PR #93 as opened fails the test rule", async () => {
  const failures = checkPullRequest(await openedPullRequest(93));
  assert.deepEqual(failures, [
    {
      rule: "test",
      files: ["src/comps.ts", "src/savedComps.ts"],
      message: `Source code changed with no change under tests/: src/comps.ts, src/savedComps.ts. ${TEST_FIX}`,
    },
  ]);
});

await test("PR #94 as opened fails the media rule", async () => {
  const failures = checkPullRequest(await openedPullRequest(94));
  assert.deepEqual(rules(failures), [
    [
      "media",
      [
        "src/App.tsx",
        "src/AppPanels.tsx",
        "src/CompBuilder.tsx",
        "src/CompSettingsPanel.tsx",
        "src/GameModeIcon.tsx",
        "src/MapPicker.tsx",
        "src/SavedCompCard.tsx",
        "src/app.css",
        "src/builder.css",
        "src/useBoardController.tsx",
      ],
    ],
  ]);
});

await test("PR #94 passes after a media link is in the body", async () => {
  const opened = await openedPullRequest(94);
  const body = opened.body.replace(
    "MEDIA",
    "![after](https://github.com/user-attachments/assets/128007fe-f057-492e-b3b7-1221a8127ca5)",
  );
  assert.deepEqual(checkPullRequest({ ...opened, body }), []);
});

await test("a no-test line with a reason satisfies the test rule", () => {
  const pr = { title: "fix: x", files: ["src/comps.ts"] };
  assert.deepEqual(
    checkPullRequest({ ...pr, body: "Summary.\n\nno-test: copy change only" }),
    [],
  );
  assert.deepEqual(rules(checkPullRequest({ ...pr, body: "no-test:" })), [
    ["test", ["src/comps.ts"]],
  ]);
  assert.deepEqual(
    rules(checkPullRequest({ ...pr, body: "We added no-test: here" })),
    [["test", ["src/comps.ts"]]],
  );
});

await test("CSS-only and non-source changes need no test", () => {
  assert.deepEqual(
    checkPullRequest({
      title: "style: x",
      body: "No visible change",
      files: ["src/app.css", "README.md", "scripts/releases.ts"],
    }),
    [],
  );
});

await test("a No visible change line satisfies the media rule", () => {
  const pr = {
    title: "refactor: x",
    files: ["src/App.tsx", "tests/a.spec.ts"],
  };
  assert.deepEqual(
    checkPullRequest({ ...pr, body: "Moves a prop.\n\nNo visible change." }),
    [],
  );
  assert.deepEqual(
    rules(checkPullRequest({ ...pr, body: "There is no visible change." })),
    [["media", ["src/App.tsx"]]],
  );
});

await test("any GitHub upload link satisfies the media rule", () => {
  for (const link of [
    "https://github.com/user-attachments/assets/5bb9e9f5-cd05-4736-8b43-7f283a478fc1",
    "https://github.com/user-attachments/files/123/clip.mp4",
    "https://private-user-images.githubusercontent.com/1/2.png",
  ])
    assert.deepEqual(
      checkPullRequest({
        title: "feat: x",
        body: `![shot](${link})`,
        files: ["src/MapPicker.tsx", "tests/mapPicker.spec.ts"],
      }),
      [],
    );
  assert.deepEqual(
    rules(
      checkPullRequest({
        title: "feat: x",
        body: "![shot](https://example.com/shot.png)",
        files: ["src/MapPicker.tsx", "tests/mapPicker.spec.ts"],
      }),
    ),
    [["media", ["src/MapPicker.tsx"]]],
  );
});

await test("agent files need the agents scope in the title", () => {
  const files = [
    "AGENTS.md",
    "docs/CLAUDE.md",
    ".claude/skills/verify/SKILL.md",
  ];
  assert.deepEqual(
    checkPullRequest({ title: "docs(agents): trim rules", body: "", files }),
    [],
  );
  assert.deepEqual(
    checkPullRequest({ title: "chore(ci, agents)!: move", body: "", files }),
    [],
  );
  assert.deepEqual(
    checkPullRequest({ title: "docs(agent): trim rules", body: "", files }),
    [
      {
        rule: "agents",
        files,
        message: `Agent instruction files changed without the agents scope: AGENTS.md, docs/CLAUDE.md, .claude/skills/verify/SKILL.md. ${AGENTS_FIX}`,
      },
    ],
  );
  assert.deepEqual(
    rules(
      checkPullRequest({ title: "docs: trim (agents)", body: "agents", files }),
    ),
    [["agents", files]],
  );
});
