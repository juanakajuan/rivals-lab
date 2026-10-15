import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  commitReleaseFiles,
  deployRelease,
  lockBuildOutput,
  parseReleases,
  readReleaseNotes,
  recoverRelease,
  type CommandRunner,
} from "../scripts/releases.ts";

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rivals-release-"));
  await mkdir(join(root, "releases", "pending"), { recursive: true });
  await writeFile(join(root, "releases", "published.json"), "[]\n");
  await addNote(root, "new-map", "Feature: Choose the new map.");
  return root;
}

async function addNote(root: string, id: string, text: string): Promise<void> {
  await writeFile(
    join(root, "releases", "pending", `${id}.json`),
    `${JSON.stringify({ text })}\n`,
  );
}

async function pendingFiles(root: string): Promise<string[]> {
  return (await readdir(join(root, "releases", "pending"))).sort();
}

async function build(root: string): Promise<void> {
  await mkdir(join(root, ".cloudflare", "output", "v0"), { recursive: true });
  await writeFile(
    join(root, ".cloudflare", "output", "v0", "bundle.txt"),
    "exact candidate bundle",
  );
}

async function ledger(root: string): Promise<unknown> {
  const value: unknown = JSON.parse(
    await readFile(join(root, "releases", "published.json"), "utf8"),
  );
  return value;
}

await test("every note in releases/pending is unpublished and starts with Feature: or Bug fix:", async () => {
  const { pending } = await readReleaseNotes(join(import.meta.dirname, ".."));
  for (const note of pending) assert.match(note.text, /^(Feature|Bug fix): /);
});

const shippedRelease = JSON.stringify([
  {
    id: "shipped",
    date: "2026-10-01",
    notes: [{ id: "new-map", text: "Feature: Choose the new map." }],
  },
]);

const invalidNotes: readonly {
  readonly name: string;
  readonly change: (root: string) => Promise<void>;
  readonly error: string;
}[] = [
  {
    name: "a pending ID that is already published",
    change: (root) =>
      writeFile(join(root, "releases", "published.json"), shippedRelease),
    error:
      "releases/pending/new-map.json: this ID is already in releases/published.json. Delete the file, or use a new ID for a later change.",
  },
  {
    name: "note text without a release prefix",
    change: (root) => addNote(root, "plain", "Choose a map."),
    error:
      'releases/pending/plain.json: start the note text with "Feature: " or "Bug fix: ".',
  },
  {
    name: "an ID inside the note file",
    change: (root) =>
      writeFile(
        join(root, "releases", "pending", "with-id.json"),
        '{"id":"with-id","text":"Feature: Two IDs."}',
      ),
    error:
      'releases/pending/with-id.json: the file must contain only {"text": "..."}. The file name is the note ID.',
  },
  {
    name: "a file name that is not a note ID",
    change: (root) => addNote(root, "New_Map", "Feature: A map."),
    error:
      "releases/pending/New_Map.json: name each note file <id>.json, with an ID of lowercase letters, digits, and single hyphens.",
  },
];

for (const invalid of invalidNotes) {
  await test(`release notes and deploy reject ${invalid.name}`, async () => {
    const root = await fixture();
    try {
      await invalid.change(root);
      await assert.rejects(readReleaseNotes(root), { message: invalid.error });
      const commands: string[] = [];
      await assert.rejects(
        deployRelease({
          root,
          run: (command) => {
            commands.push(command.executable);
            return Promise.resolve();
          },
        }),
        { message: invalid.error },
      );
      assert.deepEqual(commands, []);
    } finally {
      await rm(root, { recursive: true });
    }
  });
}

await test("repeated build cleanup preserves the next build's exclusive lock", async () => {
  const root = await fixture();
  try {
    const releaseFirst = await lockBuildOutput(root);
    await assert.rejects(lockBuildOutput(root), { code: "EEXIST" });
    await releaseFirst();
    const releaseSecond = await lockBuildOutput(root);
    await releaseFirst();
    await assert.rejects(lockBuildOutput(root), { code: "EEXIST" });
    await releaseSecond();
    const releaseThird = await lockBuildOutput(root);
    await releaseThird();
  } finally {
    await rm(root, { recursive: true });
  }
});

await test("production publication builds candidate once, verifies live identity, and consumes included notes", async () => {
  const root = await fixture();
  try {
    let candidateId = "";
    const commands: string[][] = [];
    const run: CommandRunner = async (command) => {
      commands.push([command.executable, ...command.args]);
      if (command.executable === "npm") {
        const path = command.env["RIVALS_RELEASE_CANDIDATE"];
        assert.ok(path);
        const value: unknown = JSON.parse(await readFile(path, "utf8"));
        const releases = parseReleases(value);
        const release = releases[0];
        assert.ok(release);
        candidateId = release.id;
        assert.deepEqual(release.notes, [
          { id: "new-map", text: "Feature: Choose the new map." },
        ]);
        assert.equal(release.date, "2026-10-02");
        assert.deepEqual(await ledger(root), []);
        await build(root);
      } else {
        assert.equal(
          await readFile(
            join(root, ".cloudflare", "output", "v0", "bundle.txt"),
            "utf8",
          ),
          "exact candidate bundle",
        );
        await addNote(root, "next", "Bug fix: Next update.");
      }
    };
    await deployRelease({
      root,
      run,
      now: new Date("2026-10-02T00:01:00Z"),
      verify: async (releases, id) => {
        assert.equal(id, candidateId);
        assert.equal(releases[0]?.id, candidateId);
        assert.deepEqual(await ledger(root), []);
      },
    });
    assert.deepEqual(commands, [
      ["npm", "run", "build", "--", "--mode", "production"],
      ["npx", "cf", "deploy", "--prebuilt", "--mode", "production"],
    ]);
    assert.deepEqual(await ledger(root), [
      {
        id: candidateId,
        date: "2026-10-02",
        notes: [{ id: "new-map", text: "Feature: Choose the new map." }],
      },
    ]);
    assert.deepEqual(await pendingFiles(root), ["next.json"]);
  } finally {
    await rm(root, { recursive: true });
  }
});

for (const partiallyPromoted of [false, true]) {
  await test(`recovery verifies the live receipt and completes publication after partial promotion ${partiallyPromoted}`, async (context) => {
    const root = await fixture();
    try {
      await assert.rejects(
        deployRelease({
          root,
          now: new Date("2026-10-02T00:01:00Z"),
          run: async (command) => {
            if (command.executable === "npm") await build(root);
            else throw new Error("deployment outcome uncertain");
          },
        }),
        /deployment outcome uncertain/,
      );
      const receipt: unknown = JSON.parse(
        await readFile(join(root, ".release", "receipt.json"), "utf8"),
      );
      assert.ok(
        typeof receipt === "object" &&
          receipt !== null &&
          "id" in receipt &&
          typeof receipt.id === "string" &&
          "releases" in receipt,
      );
      const expected = [
        {
          id: receipt.id,
          date: "2026-10-02",
          notes: [{ id: "new-map", text: "Feature: Choose the new map." }],
        },
      ];
      if (partiallyPromoted) {
        await writeFile(
          join(root, "releases", "published.json"),
          JSON.stringify(expected),
        );
      }
      let candidateIsLive = false;
      context.mock.method(globalThis, "fetch", () =>
        Promise.resolve(
          Response.json({
            releaseId: candidateIsLive ? receipt.id : "another-build",
            releases: candidateIsLive ? expected : [],
          }),
        ),
      );
      await assert.rejects(recoverRelease(root, "confirm"), /does not match/);
      assert.deepEqual(await ledger(root), partiallyPromoted ? expected : []);
      assert.deepEqual(await pendingFiles(root), ["new-map.json"]);
      candidateIsLive = true;
      await recoverRelease(root, "confirm");
      assert.deepEqual(await ledger(root), expected);
      assert.deepEqual(await pendingFiles(root), []);
      await assert.rejects(readFile(join(root, ".release", "receipt.json")), {
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true });
    }
  });
}

for (const failure of ["build", "deploy", "verification"]) {
  await test(`${failure} failure preserves published history and pending notes`, async () => {
    const root = await fixture();
    try {
      const run: CommandRunner = async (command) => {
        if (command.executable === "npm") {
          if (failure === "build") throw new Error("build failed");
          await build(root);
        } else if (failure === "deploy") throw new Error("deploy failed");
      };
      await assert.rejects(
        deployRelease({
          root,
          run,
          verify: () => Promise.reject(new Error("verification failed")),
        }),
        /failed/,
      );
      assert.equal(
        await readFile(join(root, "releases", "published.json"), "utf8"),
        "[]\n",
      );
      assert.deepEqual(await pendingFiles(root), ["new-map.json"]);
      if (failure !== "build") {
        const value: unknown = JSON.parse(
          await readFile(join(root, ".release", "receipt.json"), "utf8"),
        );
        assert.ok(
          typeof value === "object" && value !== null && "releases" in value,
        );
        assert.equal(
          parseReleases(value.releases)[0]?.notes[0].text,
          "Feature: Choose the new map.",
        );
        await assert.rejects(
          deployRelease({ root, run }),
          /unresolved release receipt/,
        );
      }
    } finally {
      await rm(root, { recursive: true });
    }
  });
}

await test("a history edit during deployment stays intact and retains recovery evidence", async () => {
  const root = await fixture();
  try {
    const edited =
      '[{"id":"other-release","date":"2026-10-01","notes":[{"id":"other-note","text":"Feature: An existing update."}]}]\n';
    const run: CommandRunner = async (command) => {
      if (command.executable === "npm") await build(root);
      else await writeFile(join(root, "releases", "published.json"), edited);
    };
    await assert.rejects(
      deployRelease({ root, run, verify: () => Promise.resolve() }),
      /Published history changed/,
    );
    assert.equal(
      await readFile(join(root, "releases", "published.json"), "utf8"),
      edited,
    );
    const value: unknown = JSON.parse(
      await readFile(join(root, ".release", "receipt.json"), "utf8"),
    );
    assert.ok(
      typeof value === "object" &&
        value !== null &&
        "releases" in value &&
        "previous" in value,
    );
    assert.deepEqual(value.previous, []);
    assert.equal(
      parseReleases(value.releases)[0]?.notes[0].text,
      "Feature: Choose the new map.",
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

const git = promisify(execFile);

function successfulRun(root: string): CommandRunner {
  return async (command) => {
    if (command.executable === "npm") await build(root);
  };
}

await test("deploy commits release files only after a successful promote", async () => {
  const root = await fixture();
  try {
    const calls: string[] = [];
    await deployRelease({
      root,
      run: successfulRun(root),
      verify: () => Promise.resolve(),
      commit: async (committed) => {
        calls.push(committed);
        assert.deepEqual(await pendingFiles(root), []);
      },
    });
    assert.deepEqual(calls, [root]);
  } finally {
    await rm(root, { recursive: true });
  }
});

for (const failure of ["build", "deploy", "verification"]) {
  await test(`deploy does not commit after ${failure} failure`, async () => {
    const root = await fixture();
    try {
      let committed = false;
      await assert.rejects(
        deployRelease({
          root,
          run: async (command) => {
            if (command.executable === "npm") {
              if (failure === "build") throw new Error("build failed");
              await build(root);
            } else if (failure === "deploy") throw new Error("deploy failed");
          },
          verify: () => Promise.reject(new Error("verification failed")),
          commit: () => {
            committed = true;
            return Promise.resolve();
          },
        }),
        /failed/,
      );
      assert.equal(committed, false);
    } finally {
      await rm(root, { recursive: true });
    }
  });
}

await test("a failing committer only warns and the deploy still succeeds", async (context) => {
  const root = await fixture();
  try {
    const warn = context.mock.method(console, "warn", () => undefined);
    await deployRelease({
      root,
      run: successfulRun(root),
      verify: () => Promise.resolve(),
      commit: () => Promise.reject(new Error("git exploded")),
    });
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0]?.arguments[0]), /git exploded/);
    assert.deepEqual(await pendingFiles(root), []);
    await assert.rejects(readFile(join(root, ".release", "receipt.json")), {
      code: "ENOENT",
    });
  } finally {
    await rm(root, { recursive: true });
  }
});

for (const action of ["confirm", "discard"] as const) {
  await test(`recovery ${action} ${action === "confirm" ? "commits" : "does not commit"} release files`, async (context) => {
    const root = await fixture();
    try {
      await assert.rejects(
        deployRelease({
          root,
          run: async (command) => {
            if (command.executable === "npm") await build(root);
            else throw new Error("deployment outcome uncertain");
          },
        }),
        /uncertain/,
      );
      const receipt: unknown = JSON.parse(
        await readFile(join(root, ".release", "receipt.json"), "utf8"),
      );
      assert.ok(
        typeof receipt === "object" &&
          receipt !== null &&
          "id" in receipt &&
          "releases" in receipt,
      );
      context.mock.method(globalThis, "fetch", () =>
        Promise.resolve(
          Response.json({ releaseId: receipt.id, releases: receipt.releases }),
        ),
      );
      const calls: string[] = [];
      await recoverRelease(root, action, (committed) => {
        calls.push(committed);
        return Promise.resolve();
      });
      assert.deepEqual(calls, action === "confirm" ? [root] : []);
    } finally {
      await rm(root, { recursive: true });
    }
  });
}

await test("commitReleaseFiles commits only changed tracked release files and leaves other changes out", async () => {
  const root = await fixture();
  try {
    const run = (...args: string[]) => git("git", args, { cwd: root });
    await run("init", "-q");
    await run("config", "user.name", "Test");
    await run("config", "user.email", "test@example.com");
    await run("config", "commit.gpgsign", "false");
    await writeFile(join(root, "other.txt"), "one\n");
    await run("add", "-A");
    await run("commit", "-q", "-m", "init");
    const count = async () =>
      (await run("rev-list", "--count", "HEAD")).stdout.trim();

    await commitReleaseFiles(root);
    assert.equal(await count(), "1");

    await rm(join(root, "releases", "pending", "new-map.json"));
    await writeFile(join(root, "releases", "published.json"), "[1]\n");
    await addNote(root, "draft", "Feature: Not reviewed yet.");
    await writeFile(join(root, "other.txt"), "two\n");
    await run("add", "other.txt");
    await commitReleaseFiles(root);
    assert.equal(await count(), "2");
    assert.equal(
      (await run("show", "--name-status", "--format=%s", "HEAD")).stdout.trim(),
      "chore(releases): publish release notes\n\nD\treleases/pending/new-map.json\nM\treleases/published.json",
    );
    assert.equal(
      (
        await run("status", "--porcelain", "--untracked-files=all")
      ).stdout.trim(),
      "M  other.txt\n?? releases/pending/draft.json",
    );
  } finally {
    await rm(root, { recursive: true });
  }
});
