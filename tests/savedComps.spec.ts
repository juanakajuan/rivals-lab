import { expect, test } from "@playwright/test";
import {
  MAX_IMPORT_BYTES,
  MAX_SAVED_COMPS,
  decodeCompLibrary,
  emptyComp,
  parseCompLibrary,
  serializeCompLibrary,
  type SavedComp,
  type StoredLibrarySource,
} from "../src/comps";
import { SavedCompSession, SavedCompWriteError } from "../src/savedComps";

import type { CompStorage } from "../src/appData";

class MemoryStorage implements CompStorage {
  private source: string | null;
  failWrites = false;
  beforeCommit: (() => Promise<void>) | null = null;
  afterCommit: (() => Promise<void>) | null = null;

  constructor(source: string | null = null) {
    this.source = source;
  }

  read(): Promise<string | null> {
    return Promise.resolve(this.source);
  }

  async update(
    transform: (source: string | null) => StoredLibrarySource,
  ): Promise<void> {
    const next = transform(this.source).text;
    await this.beforeCommit?.();
    if (this.failWrites) throw new Error("Storage is full.");
    this.source = next;
    await this.afterCommit?.();
  }

  subscribe(): () => void {
    return () => {};
  }

  replace(source: string): void {
    this.source = source;
  }
}

async function sessionFor(storage: CompStorage): Promise<SavedCompSession> {
  const session = new SavedCompSession(storage);
  await session.refresh();
  return session;
}

const saved: SavedComp = {
  id: "shared",
  updatedAt: "2026-09-30T12:00:00Z",
  comp: { ...emptyComp(), name: "Plan", notes: "Original notes" },
};

function entry(session: SavedCompSession, id = saved.id): SavedComp {
  const result = session.state.library.entries.find((item) => item.id === id);
  if (!result) throw new Error(`Missing saved comp: ${id}.`);
  return result;
}

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve = (): void => {
    throw new Error("The deferred operation has not started.");
  };
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const delayedWrites: readonly ("save" | "rename" | "remove" | "import")[] = [
  "save",
  "rename",
  "remove",
  "import",
];

for (const operation of delayedWrites) {
  test(`a delayed ${operation} completion keeps a newer remote library`, async () => {
    const storage = new MemoryStorage(serializeCompLibrary([saved]));
    const session = await sessionFor(storage);
    session.load(entry(session));
    const committed = deferred();
    const deliver = deferred();
    storage.afterCommit = async () => {
      committed.resolve();
      await deliver.promise;
    };
    let writing: Promise<unknown>;
    let expectedNames: readonly string[];
    switch (operation) {
      case "save":
        session.edit({ kind: "notes", value: "Local notes" });
        writing = session.save("Local plan");
        expectedNames = ["Remote plan", "Local plan"];
        break;
      case "rename":
        writing = session.rename(saved.id, "Local name");
        expectedNames = ["Remote plan", "Local name"];
        break;
      case "remove":
        writing = session.remove(saved.id);
        expectedNames = ["Remote plan"];
        break;
      case "import":
        writing = session.addCopies([saved]);
        expectedNames = ["Remote plan", "Plan", "Plan"];
        break;
    }

    await committed.promise;
    const local = parseCompLibrary(await session.exportData());
    const remote: SavedComp = {
      ...saved,
      id: "remote",
      comp: { ...saved.comp, name: "Remote plan" },
    };
    storage.replace(serializeCompLibrary([remote, ...local]));
    await session.refresh();
    expect(session.state.library.entries.map((item) => item.comp.name)).toEqual(
      expectedNames,
    );
    deliver.resolve();
    await writing;

    expect(session.state.library.entries.map((item) => item.comp.name)).toEqual(
      expectedNames,
    );
    expect(
      parseCompLibrary(await session.exportData()).map(
        (item) => item.comp.name,
      ),
    ).toEqual(expectedNames);
  });
}

test("edits during commit stay local and dirty after the submitted snapshot is saved", async () => {
  const storage = new MemoryStorage(serializeCompLibrary([saved]));
  const session = await sessionFor(storage);
  session.load(entry(session));
  session.edit({ kind: "notes", value: "Submitted notes" });
  const transformed = deferred();
  const complete = deferred();
  storage.beforeCommit = async () => {
    transformed.resolve();
    await complete.promise;
  };

  const saving = session.save(" Plan ");
  await transformed.promise;
  session.edit({ kind: "notes", value: "Newer notes" });
  session.edit({ kind: "name", value: "Newer name" });
  complete.resolve();

  expect(await saving).toEqual({ kind: "newerEdits" });
  expect(parseCompLibrary(await session.exportData())[0]?.comp).toEqual({
    ...saved.comp,
    name: "Plan",
    notes: "Submitted notes",
  });
  expect(session.state.comp).toEqual({
    ...saved.comp,
    name: "Newer name",
    notes: "Newer notes",
  });
  expect(session.state.savedId).toBe(saved.id);
  expect(session.state.dirty).toBe(true);
  expect(await session.save("Newer name")).toEqual({ kind: "clean" });
  expect(entry(session).comp.notes).toBe("Newer notes");
  expect(session.state.dirty).toBe(false);
});

test("loading another comp during commit keeps that editor and its saved link", async () => {
  const other: SavedComp = {
    ...saved,
    id: "other",
    comp: { ...saved.comp, name: "Other plan", notes: "Other notes" },
  };
  const storage = new MemoryStorage(serializeCompLibrary([saved, other]));
  const session = await sessionFor(storage);
  session.load(entry(session));
  session.edit({ kind: "notes", value: "Submitted notes" });
  const transformed = deferred();
  const complete = deferred();
  storage.beforeCommit = async () => {
    transformed.resolve();
    await complete.promise;
  };

  const saving = session.save("Plan");
  await transformed.promise;
  session.load(entry(session, other.id));
  complete.resolve();

  expect(await saving).toEqual({ kind: "differentEditor" });
  expect(entry(session).comp.notes).toBe("Submitted notes");
  expect(session.state.comp).toEqual(other.comp);
  expect(session.state.savedId).toBe(other.id);
  expect(session.state.dirty).toBe(false);
  session.edit({ kind: "notes", value: "Updated other notes" });
  expect(await session.save("Other plan")).toEqual({ kind: "clean" });
  expect(entry(session, other.id).comp.notes).toBe("Updated other notes");
  expect(session.state.library.entries).toHaveLength(2);
});

test("failed writes preserve local edits, saved state, and stored data", async () => {
  const storage = new MemoryStorage(serializeCompLibrary([saved]));
  const session = await sessionFor(storage);
  session.load(entry(session));
  session.edit({ kind: "notes", value: "Unsaved notes" });
  const before = session.state;
  const source = await session.exportData();
  storage.failWrites = true;

  for (const operation of [
    () => session.save("Plan"),
    () => session.rename(saved.id, "Renamed"),
    () => session.remove(saved.id),
  ]) {
    await expect(operation()).rejects.toThrow(SavedCompWriteError);
    expect(session.state).toBe(before);
    expect(await session.exportData()).toBe(source);
  }
  await expect(session.addCopies([saved])).rejects.toThrow(SavedCompWriteError);
  expect(session.state).toBe(before);
  expect(await session.exportData()).toBe(source);

  storage.failWrites = false;
  await session.save(" Plan ");
  expect(session.state.dirty).toBe(false);
  expect(session.state.comp.name).toBe("Plan");
  expect(entry(session).comp.notes).toBe("Unsaved notes");
  session.edit({ kind: "notes", value: "Later edit" });
  await session.rename(saved.id, "Renamed");
  expect(session.state.dirty).toBe(true);
  expect(session.state.comp.notes).toBe("Later edit");
  await session.save("Renamed");
  expect(entry(session).comp.notes).toBe("Later edit");
  await session.remove(saved.id);
  expect(session.state.savedId).toBeNull();
  expect(session.state.dirty).toBe(true);
  expect(session.state.comp.notes).toBe("Later edit");
});

for (const renameBeforeSave of [false, true]) {
  test(`same-time remote changes block stale saves${renameBeforeSave ? " after rename" : " after refresh"}`, async () => {
    const storage = new MemoryStorage(serializeCompLibrary([saved]));
    const session = await sessionFor(storage);
    session.load(entry(session));
    session.edit({ kind: "notes", value: "Local edits" });
    const newer = { ...saved, comp: { ...saved.comp, notes: "Remote edits" } };
    storage.replace(serializeCompLibrary([newer]));
    await session.refresh();
    expect(session.state.comp.notes).toBe("Local edits");
    if (renameBeforeSave) await session.rename(saved.id, "Renamed");

    const before = session.state;
    const source = await session.exportData();
    await expect(session.save(session.state.comp.name)).rejects.toThrow(
      "changed in another tab",
    );
    expect(session.state).toBe(before);
    expect(await session.exportData()).toBe(source);

    await session.save("Recovered copy", true);
    expect(session.state.savedId).not.toBe(saved.id);
    expect(session.state.dirty).toBe(false);
    expect(session.state.comp.notes).toBe("Local edits");
    expect(entry(session).comp.notes).toBe("Remote edits");
    expect(session.state.library.entries).toHaveLength(2);
  });
}

test("a deleted or unavailable saved comp cannot be restored by a stale editor", async () => {
  for (const replacement of [
    serializeCompLibrary([]),
    JSON.stringify({
      version: 1,
      comps: [{ ...saved, comp: { ...saved.comp, mapId: "retired-map" } }],
    }),
  ]) {
    const storage = new MemoryStorage(serializeCompLibrary([saved]));
    const session = await sessionFor(storage);
    session.load(entry(session));
    session.edit({ kind: "notes", value: "Local edits" });
    storage.replace(replacement);
    await session.refresh();
    const before = session.state;
    await expect(session.save("Plan")).rejects.toThrow(
      "deleted in another tab",
    );
    expect(session.state).toBe(before);
    expect(await session.exportData()).toBe(replacement);
    await session.save("Recovered copy", true);
    expect(session.state.savedId).not.toBe(saved.id);
    expect(session.state.comp.notes).toBe("Local edits");
  }
});

test("library operations preserve recovery data, metadata, and explicit legacy migration", async () => {
  const unavailable = {
    ...saved,
    id: "obsolete",
    comp: { ...saved.comp, mapId: "retired-map" },
  };
  const legacy = {
    ...saved,
    comp: {
      ...saved.comp,
      teams: {
        ...saved.comp.teams,
        ally: saved.comp.teams.ally.map((slot, index) =>
          index === 0 ? { ...slot, heroId: "deadpool" } : slot,
        ),
      },
      draft: { format: "ignite", firstTeam: "ally", choices: ["strange"] },
    },
  };
  const storage = new MemoryStorage(
    JSON.stringify({
      version: 1,
      recoveryNote: "Keep metadata",
      comps: [legacy, unavailable],
    }),
  );
  const session = await sessionFor(storage);
  expect(session.state.library.unavailableCount).toBe(1);
  const migrated = entry(session);
  expect(migrated.comp.draft?.teams.ally.ban[0]).toBe("strange");
  expect(migrated.comp.teams.ally[0]?.deadpoolRole).toBeUndefined();
  session.load(migrated);
  session.edit({ kind: "notes", value: "Updated notes" });
  await session.save("Plan");
  await session.rename(saved.id, "Renamed");
  const imported = await session.addCopies(
    parseCompLibrary(await session.exportData(entry(session))),
  );
  expect(imported.count).toBe(1);
  const copy = session.state.library.entries.find(
    (item) => item.id !== saved.id,
  );
  if (!copy) throw new Error("Missing imported copy.");
  await session.remove(copy.id);

  const raw: unknown = JSON.parse(await session.exportData());
  expect(raw).toMatchObject({
    version: 1,
    recoveryNote: "Keep metadata",
    comps: expect.arrayContaining([unavailable]),
  });
  const reloaded = await sessionFor(storage);
  expect(entry(reloaded).comp).toEqual({
    ...migrated.comp,
    name: "Renamed",
    notes: "Updated notes",
  });
  expect(parseCompLibrary(await session.exportData(entry(session)))).toEqual([
    entry(session),
  ]);
});

test("invalid library data stays available for export and cannot be overwritten", async () => {
  const source = "broken saved data";
  const session = await sessionFor(new MemoryStorage(source));
  expect(session.state.library.error).toContain(
    "Saved comps could not be read",
  );
  session.edit({ kind: "name", value: "Do not overwrite" });
  const before = session.state;
  await expect(session.save("Do not overwrite")).rejects.toThrow(
    SavedCompWriteError,
  );
  expect(session.state).toBe(before);
  expect(await session.exportData()).toBe(source);
});

test("unavailable entries count toward storage limits and failed imports are atomic", async () => {
  const unavailable = {
    ...saved,
    id: "obsolete",
    comp: { ...saved.comp, mapId: "retired-map" },
  };
  const full = JSON.stringify({
    version: 1,
    comps: Array.from({ length: MAX_SAVED_COMPS }, (_, index) => ({
      ...unavailable,
      id: `obsolete-${index}`,
    })),
  });
  const oversized = JSON.stringify({
    version: 1,
    comps: [{ ...unavailable, recoveryPayload: "x".repeat(MAX_IMPORT_BYTES) }],
  });
  for (const source of [full, oversized]) {
    const session = await sessionFor(new MemoryStorage(source));
    session.edit({ kind: "name", value: "New comp" });
    const before = session.state;
    await expect(session.save("New comp")).rejects.toThrow("library limit");
    await expect(session.addCopies([saved])).rejects.toThrow("library limit");
    expect(session.state).toBe(before);
    expect(await session.exportData()).toBe(source);
  }
});

test("copies keep the open comp, its edits, and its saved link", async () => {
  const session = await sessionFor(
    new MemoryStorage(serializeCompLibrary([saved])),
  );
  session.load(entry(session));
  session.edit({ kind: "notes", value: "Still unsaved" });
  expect(await session.addCopies([saved])).toEqual({ count: 1 });
  expect(session.state.comp.notes).toBe("Still unsaved");
  expect(session.state.dirty).toBe(true);
  expect(session.state.savedId).toBe(saved.id);
  expect(session.state.library.entries.map((item) => item.comp.name)).toEqual([
    "Plan",
    "Plan",
  ]);
  expect(session.openComp.saved?.id).toBe(saved.id);
});

test("a session resumes a stored open comp and drops a stale link", async () => {
  const storage = new MemoryStorage(serializeCompLibrary([saved]));
  const library = decodeCompLibrary(serializeCompLibrary([saved]));
  const edited = { ...saved.comp, notes: "Resumed edits" };
  const linked = new SavedCompSession(storage, {
    library,
    openComp: {
      comp: edited,
      baseline: saved.comp,
      saved: { id: saved.id, baseline: saved.comp },
    },
  });
  expect(linked.state).toMatchObject({
    comp: edited,
    savedId: saved.id,
    dirty: true,
  });
  await linked.save("Plan");
  expect(entry(linked).comp.notes).toBe("Resumed edits");

  const stale = { ...saved.comp, notes: "Older version" };
  const detached = new SavedCompSession(storage, {
    library,
    openComp: {
      comp: edited,
      baseline: stale,
      saved: { id: saved.id, baseline: stale },
    },
  });
  expect(detached.state).toMatchObject({
    comp: edited,
    savedId: null,
    dirty: true,
  });
  expect(detached.openComp).toEqual({
    comp: edited,
    baseline: stale,
    saved: null,
  });
});

test("rejected edits preserve session state and conflict plans remain savable", async () => {
  const storage = new MemoryStorage(serializeCompLibrary([saved]));
  const session = await sessionFor(storage);
  session.load(entry(session));
  session.edit({
    kind: "chooseHero",
    target: { kind: "slot", team: "ally", index: 0 },
    selection: { heroId: "hulk" },
  });
  const before = session.state;
  expect(() =>
    session.edit({
      kind: "chooseHero",
      target: { kind: "slot", team: "ally", index: 1 },
      selection: { heroId: "hulk" },
    }),
  ).toThrow("Already on this team.");
  expect(session.state).toBe(before);
  expect(session.state.dirty).toBe(true);
  session.edit({ kind: "draftFormat", format: "mrc" });
  session.edit({
    kind: "chooseHero",
    target: { kind: "draft", slot: { team: "ally", kind: "ban", index: 0 } },
    selection: { heroId: "hulk" },
  });
  await session.save("Plan");
  const reloaded = await sessionFor(storage);
  reloaded.load(entry(reloaded));
  expect(reloaded.state.comp.teams.ally[0]).toEqual({
    heroId: "hulk",
    notes: "",
  });
  expect(reloaded.state.comp.draft?.teams.ally.ban).toEqual([
    "hulk",
    null,
    null,
    null,
  ]);
  expect(reloaded.state.dirty).toBe(false);
});
