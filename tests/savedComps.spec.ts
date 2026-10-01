import { expect, test } from "@playwright/test";
import {
  COMP_STORAGE_KEY,
  MAX_IMPORT_BYTES,
  MAX_SAVED_COMPS,
  emptyComp,
  parseCompLibrary,
  serializeCompLibrary,
  type SavedComp,
} from "../src/comps";
import {
  SavedCompSession,
  SavedCompWriteError,
  type CompImportFile,
  type CompStorage,
} from "../src/savedComps";

class MemoryStorage implements CompStorage {
  private readonly data = new Map<string, string>();
  failWrites = false;

  constructor(source?: string) {
    if (source !== undefined) this.data.set(COMP_STORAGE_KEY, source);
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("Storage is full.");
    this.data.set(key, value);
  }
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

function importFile(source: string): CompImportFile {
  return {
    size: new TextEncoder().encode(source).byteLength,
    text: async () => source,
  };
}

test("failed writes preserve local edits, saved state, and stored data", async () => {
  const storage = new MemoryStorage(serializeCompLibrary([saved]));
  const session = new SavedCompSession(storage);
  session.load(entry(session));
  session.edit({ ...session.state.comp, notes: "Unsaved notes" });
  const before = session.state;
  const source = session.exportData();
  storage.failWrites = true;

  for (const operation of [
    () => session.save("Plan"),
    () => session.rename(saved.id, "Renamed"),
    () => session.remove(saved.id),
  ]) {
    expect(operation).toThrow(SavedCompWriteError);
    expect(session.state).toBe(before);
    expect(session.exportData()).toBe(source);
  }
  await expect(
    session.importFile(importFile(serializeCompLibrary([saved]))),
  ).rejects.toThrow(SavedCompWriteError);
  expect(session.state).toBe(before);
  expect(session.exportData()).toBe(source);

  storage.failWrites = false;
  session.save(" Plan ");
  expect(session.state.dirty).toBe(false);
  expect(session.state.comp.name).toBe("Plan");
  expect(entry(session).comp.notes).toBe("Unsaved notes");
  session.edit({ ...session.state.comp, notes: "Later edit" });
  session.rename(saved.id, "Renamed");
  expect(session.state.dirty).toBe(true);
  expect(session.state.comp.notes).toBe("Later edit");
  session.save("Renamed");
  expect(entry(session).comp.notes).toBe("Later edit");
  session.remove(saved.id);
  expect(session.state.savedId).toBeNull();
  expect(session.state.dirty).toBe(true);
  expect(session.state.comp.notes).toBe("Later edit");
});

for (const renameBeforeSave of [false, true]) {
  test(`same-time remote changes block stale saves${renameBeforeSave ? " after rename" : " after refresh"}`, () => {
    const storage = new MemoryStorage(serializeCompLibrary([saved]));
    const session = new SavedCompSession(storage);
    session.load(entry(session));
    session.edit({ ...session.state.comp, notes: "Local edits" });
    const newer = { ...saved, comp: { ...saved.comp, notes: "Remote edits" } };
    storage.setItem(COMP_STORAGE_KEY, serializeCompLibrary([newer]));
    session.refresh(COMP_STORAGE_KEY);
    expect(session.state.comp.notes).toBe("Local edits");
    if (renameBeforeSave) session.rename(saved.id, "Renamed");

    const before = session.state;
    const source = session.exportData();
    expect(() => session.save(session.state.comp.name)).toThrow(
      "changed in another tab",
    );
    expect(session.state).toBe(before);
    expect(session.exportData()).toBe(source);

    session.save("Recovered copy", true);
    expect(session.state.savedId).not.toBe(saved.id);
    expect(session.state.dirty).toBe(false);
    expect(session.state.comp.notes).toBe("Local edits");
    expect(entry(session).comp.notes).toBe("Remote edits");
    expect(session.state.library.entries).toHaveLength(2);
  });
}

test("a deleted or unavailable saved comp cannot be restored by a stale editor", () => {
  for (const replacement of [
    serializeCompLibrary([]),
    JSON.stringify({
      version: 1,
      comps: [{ ...saved, comp: { ...saved.comp, mapId: "retired-map" } }],
    }),
  ]) {
    const storage = new MemoryStorage(serializeCompLibrary([saved]));
    const session = new SavedCompSession(storage);
    session.load(entry(session));
    session.edit({ ...session.state.comp, notes: "Local edits" });
    storage.setItem(COMP_STORAGE_KEY, replacement);
    session.refresh();
    const before = session.state;
    expect(() => session.save("Plan")).toThrow("deleted in another tab");
    expect(session.state).toBe(before);
    expect(session.exportData()).toBe(replacement);
    session.save("Recovered copy", true);
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
  const session = new SavedCompSession(storage);
  expect(session.state.library.unavailableCount).toBe(1);
  const migrated = entry(session);
  expect(migrated.comp.draft?.teams.ally.ban[0]).toBe("strange");
  expect(migrated.comp.teams.ally[0]?.deadpoolRole).toBeUndefined();
  session.load(migrated);
  session.edit({ ...session.state.comp, notes: "Updated notes" });
  session.save("Plan");
  session.rename(saved.id, "Renamed");
  const imported = await session.importFile(
    importFile(session.exportData(entry(session))),
  );
  expect(imported.count).toBe(1);
  const copy = session.state.library.entries.find(
    (item) => item.id !== saved.id,
  );
  if (!copy) throw new Error("Missing imported copy.");
  session.remove(copy.id);

  const raw: unknown = JSON.parse(session.exportData());
  expect(raw).toMatchObject({
    version: 1,
    recoveryNote: "Keep metadata",
    comps: expect.arrayContaining([unavailable]),
  });
  const reloaded = new SavedCompSession(storage);
  expect(entry(reloaded).comp).toEqual({
    ...migrated.comp,
    name: "Renamed",
    notes: "Updated notes",
  });
  expect(parseCompLibrary(session.exportData(entry(session)))).toEqual([
    entry(session),
  ]);
});

test("invalid library data stays available for export and cannot be overwritten", () => {
  const source = "broken saved data";
  const session = new SavedCompSession(new MemoryStorage(source));
  expect(session.state.library.error).toContain(
    "Saved comps could not be read",
  );
  session.edit({ ...session.state.comp, name: "Do not overwrite" });
  const before = session.state;
  expect(() => session.save("Do not overwrite")).toThrow(SavedCompWriteError);
  expect(session.state).toBe(before);
  expect(session.exportData()).toBe(source);
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
    const session = new SavedCompSession(new MemoryStorage(source));
    session.edit({ ...session.state.comp, name: "New comp" });
    const before = session.state;
    expect(() => session.save("New comp")).toThrow("library limit");
    await expect(
      session.importFile(importFile(serializeCompLibrary([saved]))),
    ).rejects.toThrow("library limit");
    expect(session.state).toBe(before);
    expect(session.exportData()).toBe(source);
  }

  const session = new SavedCompSession(
    new MemoryStorage(serializeCompLibrary([saved])),
  );
  const before = session.state;
  const source = session.exportData();
  await expect(
    session.importFile(
      importFile(JSON.stringify({ version: 1, comps: [saved, unavailable] })),
    ),
  ).rejects.toThrow("Unknown map");
  await expect(
    session.importFile(importFile("x".repeat(MAX_IMPORT_BYTES + 1))),
  ).rejects.toThrow("2 MB");
  expect(session.state).toBe(before);
  expect(session.exportData()).toBe(source);
});

test("an import keeps edits and library writes made while the file is read", async () => {
  const session = new SavedCompSession(new MemoryStorage());
  let finishRead: (source: string) => void = () => {
    throw new Error("The read has not started.");
  };
  const source = serializeCompLibrary([saved]);
  const importing = session.importFile({
    size: new TextEncoder().encode(source).byteLength,
    text: () =>
      new Promise<string>((resolve) => {
        finishRead = resolve;
      }),
  });
  session.edit({ ...session.state.comp, notes: "Edits during import" });
  session.save("New comp");
  const savedId = session.state.savedId;
  session.edit({ ...session.state.comp, notes: "Still unsaved" });
  finishRead(source);
  const result = await importing;
  expect(result.state.comp.notes).toBe("Still unsaved");
  expect(result.state.dirty).toBe(true);
  expect(result.state.savedId).toBe(savedId);
  expect(result.state.library.entries).toHaveLength(2);
  expect(result.state.library.entries.map((item) => item.id)).not.toContain(
    saved.id,
  );
});
