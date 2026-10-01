import {
  COMP_STORAGE_KEY,
  MAX_IMPORT_BYTES,
  MAX_SAVED_COMPS,
  decodeCompLibrary,
  emptyComp,
  parseCompLibrary,
  serializeCompLibrary,
  type Comp,
  type CompLibrary,
  type SavedComp,
} from "./comps";

export type CompStorage = Pick<Storage, "getItem" | "setItem">;

export interface SavedCompLibraryView {
  readonly entries: readonly SavedComp[];
  readonly error: string | null;
  readonly unavailableCount: number;
}

export interface SavedCompSessionState {
  readonly comp: Comp;
  readonly savedId: string | null;
  readonly dirty: boolean;
  readonly library: SavedCompLibraryView;
}

export interface CompImportFile {
  readonly size: number;
  text(): Promise<string>;
}

export interface CompImportResult {
  readonly count: number;
  readonly state: SavedCompSessionState;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed.";
}

export class SavedCompWriteError extends Error {
  constructor(cause: unknown) {
    super(errorMessage(cause), { cause });
    this.name = "SavedCompWriteError";
  }
}

// Access storage inside operations so an unavailable browser store can be reported.
const browserStorage: CompStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

function libraryView(library: CompLibrary): SavedCompLibraryView {
  return {
    entries: library.entries,
    unavailableCount: library.unavailable.length,
    error: library.unavailable.length
      ? `${library.unavailable.length} saved comp(s) cannot be loaded. ${library.errors.join(" ")}`
      : null,
  };
}

// Normalize optional fields and key order, including legacy saved data.
function savedCompRevision(entry: SavedComp): string {
  return serializeCompLibrary(parseCompLibrary(serializeCompLibrary([entry])));
}

function sameComp(left: Comp, right: Comp): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Owns the library and editor save state; display code owns confirmations. */
export class SavedCompSession {
  private baseline = emptyComp();
  private revision: string | null = null;
  private current: SavedCompSessionState;

  constructor(private readonly storage: CompStorage = browserStorage) {
    this.current = {
      comp: this.baseline,
      savedId: null,
      dirty: false,
      library: this.readLibrary(),
    };
  }

  get state(): SavedCompSessionState {
    return this.current;
  }

  edit(comp: Comp): SavedCompSessionState {
    this.current = {
      ...this.current,
      comp,
      dirty: !sameComp(comp, this.baseline),
    };
    return this.current;
  }

  load(entry: SavedComp | null): SavedCompSessionState {
    const comp = entry?.comp ?? emptyComp();
    const revision = entry ? savedCompRevision(entry) : null;
    this.baseline = comp;
    this.revision = revision;
    this.current = {
      ...this.current,
      comp,
      savedId: entry?.id ?? null,
      dirty: false,
    };
    return this.current;
  }

  save(name: string, asCopy = false): SavedCompSessionState {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Enter a comp name before saving.");
    const comp = { ...this.current.comp, name: trimmed };
    const savedId = this.current.savedId;
    const id = asCopy || savedId === null ? crypto.randomUUID() : savedId;
    const entry: SavedComp = {
      id,
      comp,
      updatedAt: new Date().toISOString(),
    };
    const revision = savedCompRevision(entry);
    const library = this.write((current) => {
      if (!asCopy && savedId !== null) {
        const stored = current.find((item) => item.id === savedId);
        if (!stored || savedCompRevision(stored) !== this.revision)
          throw new Error(
            stored
              ? "This comp changed in another tab. Your edits were kept. Use Save As to save a copy, or load the saved comp to use that version."
              : "This comp was deleted in another tab. Your edits were kept. Use Save As to save a copy.",
          );
      }
      return [entry, ...current.filter((item) => item.id !== id)];
    });
    this.baseline = comp;
    this.revision = revision;
    this.current = { comp, savedId: id, dirty: false, library };
    return this.current;
  }

  rename(id: string, name: string): SavedCompSessionState {
    let revision = this.revision;
    const library = this.write((current) =>
      current.map((entry) => {
        if (entry.id !== id) return entry;
        const nextEntry: SavedComp = {
          ...entry,
          comp: { ...entry.comp, name },
          updatedAt: new Date().toISOString(),
        };
        // A rename must not make stale editor content safe to overwrite.
        if (
          this.current.savedId === id &&
          savedCompRevision(entry) === this.revision
        )
          revision = savedCompRevision(nextEntry);
        return nextEntry;
      }),
    );
    let comp = this.current.comp;
    if (this.current.savedId === id) {
      comp = { ...comp, name };
      this.baseline = { ...this.baseline, name };
      this.revision = revision;
    }
    this.current = {
      ...this.current,
      comp,
      dirty: !sameComp(comp, this.baseline),
      library,
    };
    return this.current;
  }

  remove(id: string): SavedCompSessionState {
    const library = this.write((current) =>
      current.filter((entry) => entry.id !== id),
    );
    let savedId = this.current.savedId;
    if (savedId === id) {
      savedId = null;
      this.revision = null;
      this.baseline = emptyComp();
    }
    this.current = {
      ...this.current,
      savedId,
      dirty: !sameComp(this.current.comp, this.baseline),
      library,
    };
    return this.current;
  }

  async importFile(file: CompImportFile): Promise<CompImportResult> {
    if (file.size > MAX_IMPORT_BYTES)
      throw new Error("The file must be smaller than 2 MB.");
    const source = await file.text();
    if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES)
      throw new Error("The file must be smaller than 2 MB.");
    const imported = parseCompLibrary(source);
    if (!imported.length) throw new Error("This file has no saved comps.");
    const copies = imported.map((entry): SavedComp => ({
      ...entry,
      id: crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    }));
    const library = this.write((current) => [...copies, ...current]);
    this.current = { ...this.current, library };
    return { count: copies.length, state: this.current };
  }

  exportData(entry?: SavedComp): string {
    return entry
      ? serializeCompLibrary([entry])
      : (this.storage.getItem(COMP_STORAGE_KEY) ?? serializeCompLibrary([]));
  }

  /** A library refresh never replaces local edits or makes a stale save safe. */
  refresh(key: string | null = null): SavedCompSessionState {
    if (key === COMP_STORAGE_KEY || key === null)
      this.current = { ...this.current, library: this.readLibrary() };
    return this.current;
  }

  private readLibrary(): SavedCompLibraryView {
    try {
      return libraryView(decodeCompLibrary(this.exportData()));
    } catch (error) {
      return {
        entries: [],
        unavailableCount: 0,
        error: `Saved comps could not be read: ${errorMessage(error)}`,
      };
    }
  }

  /** Re-read before writing; publish saved state only after storage accepts it. */
  private write(
    update: (current: readonly SavedComp[]) => readonly SavedComp[],
  ): SavedCompLibraryView {
    try {
      const current = decodeCompLibrary(this.exportData());
      const next = update(current.entries);
      for (const item of current.unavailable)
        if (
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          next.some((entry) => entry.id === item.id)
        )
          throw new Error("A comp ID belongs to an unavailable entry.");
      const comps = [...next, ...current.unavailable];
      if (comps.length > MAX_SAVED_COMPS)
        throw new Error(`The library limit is ${MAX_SAVED_COMPS} comps.`);
      parseCompLibrary(serializeCompLibrary(next));
      const source = JSON.stringify({ ...current.envelope, comps }, null, 2);
      if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES)
        throw new Error(
          "The library limit is 2 MB. Export and remove older comps to make space.",
        );
      const result = libraryView(decodeCompLibrary(source));
      this.storage.setItem(COMP_STORAGE_KEY, source);
      return result;
    } catch (cause) {
      throw new SavedCompWriteError(cause);
    }
  }
}
