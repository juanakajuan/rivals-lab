import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  commitReleaseFiles,
  deployRelease,
  lockBuildOutput,
  parseReleases,
  recoverRelease,
  type CommandRunner,
} from "../scripts/releases.ts";

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rivals-release-"));
  await mkdir(join(root, "releases"));
  await writeFile(join(root, "releases", "published.json"), "[]\n");
  await writeFile(
    join(root, "releases", "pending.json"),
    '[{"id":"new-map","text":"Choose the new map."}]\n',
  );
  return root;
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
          { id: "new-map", text: "Choose the new map." },
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
        await writeFile(
          join(root, "releases", "pending.json"),
          '[{"id":"new-map","text":"Choose the new map."},{"id":"next","text":"Next update."}]',
        );
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
        notes: [{ id: "new-map", text: "Choose the new map." }],
      },
    ]);
    assert.equal(
      await readFile(join(root, "releases", "pending.json"), "utf8"),
      '[\n  {\n    "id": "next",\n    "text": "Next update."\n  }\n]\n',
    );
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
          notes: [{ id: "new-map", text: "Choose the new map." }],
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
      assert.equal(
        await readFile(join(root, "releases", "pending.json"), "utf8"),
        '[{"id":"new-map","text":"Choose the new map."}]\n',
      );
      candidateIsLive = true;
      await recoverRelease(root, "confirm");
      assert.deepEqual(await ledger(root), expected);
      assert.equal(
        await readFile(join(root, "releases", "pending.json"), "utf8"),
        "[]\n",
      );
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
      assert.equal(
        await readFile(join(root, "releases", "pending.json"), "utf8"),
        '[{"id":"new-map","text":"Choose the new map."}]\n',
      );
      if (failure !== "build") {
        const value: unknown = JSON.parse(
          await readFile(join(root, ".release", "receipt.json"), "utf8"),
        );
        assert.ok(
          typeof value === "object" && value !== null && "releases" in value,
        );
        assert.equal(
          parseReleases(value.releases)[0]?.notes[0].text,
          "Choose the new map.",
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
      '[{"id":"other-release","date":"2026-10-01","notes":[{"id":"other-note","text":"An existing update."}]}]\n';
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
      "Choose the new map.",
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
        assert.equal(
          await readFile(join(root, "releases", "pending.json"), "utf8"),
          "[]\n",
        );
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
    assert.equal(
      await readFile(join(root, "releases", "pending.json"), "utf8"),
      "[]\n",
    );
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

await test("commitReleaseFiles commits only changed release files and leaves staged changes out", async () => {
  const root = await mkdtemp(join(tmpdir(), "rivals-git-"));
  try {
    const run = (...args: string[]) => git("git", args, { cwd: root });
    await run("init", "-q");
    await run("config", "user.name", "Test");
    await run("config", "user.email", "test@example.com");
    await run("config", "commit.gpgsign", "false");
    await mkdir(join(root, "releases"));
    await writeFile(join(root, "releases", "pending.json"), "[]\n");
    await writeFile(join(root, "releases", "published.json"), "[]\n");
    await writeFile(join(root, "other.txt"), "one\n");
    await run("add", "-A");
    await run("commit", "-q", "-m", "init");
    const count = async () =>
      (await run("rev-list", "--count", "HEAD")).stdout.trim();

    await commitReleaseFiles(root);
    assert.equal(await count(), "1");

    await writeFile(join(root, "releases", "pending.json"), "[1]\n");
    await writeFile(join(root, "other.txt"), "two\n");
    await run("add", "other.txt");
    await commitReleaseFiles(root);
    assert.equal(await count(), "2");
    assert.equal(
      (await run("show", "--name-only", "--format=%s", "HEAD")).stdout.trim(),
      "chore(releases): publish release notes\n\nreleases/pending.json",
    );
    assert.equal(
      (await run("status", "--porcelain")).stdout.trim(),
      "M  other.txt",
    );
  } finally {
    await rm(root, { recursive: true });
  }
});
