import {
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
import { applyCompEdit, type CompEdit } from "./compEdits";
import { browserCompStorage, type CompStorage } from "./compStorage";

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
}

export type SaveResult =
  | { readonly kind: "clean" }
  | { readonly kind: "newerEdits" }
  | { readonly kind: "differentEditor" };

type EditorLink =
  | { readonly kind: "new" }
  | { readonly kind: "saved"; readonly id: string; readonly revision: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed.";
}

export class SavedCompWriteError extends Error {
  constructor(cause: unknown) {
    super(errorMessage(cause), { cause });
    this.name = "SavedCompWriteError";
  }
}

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
  private link: EditorLink = { kind: "new" };
  private current: SavedCompSessionState;
  private editorIdentity = Symbol();
  private editorGeneration = Symbol();
  private refreshGeneration = 0;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(private readonly storage: CompStorage = browserCompStorage) {
    this.current = {
      comp: this.baseline,
      savedId: null,
      dirty: false,
      library: { entries: [], unavailableCount: 0, error: null },
    };
  }

  get state(): SavedCompSessionState {
    return this.current;
  }

  edit(edit: CompEdit): SavedCompSessionState {
    const comp = applyCompEdit(this.current.comp, edit);
    this.current = {
      ...this.current,
      comp,
      dirty: !sameComp(comp, this.baseline),
    };
    this.editorGeneration = Symbol();
    return this.current;
  }

  load(entry: SavedComp | null): SavedCompSessionState {
    const comp = entry?.comp ?? emptyComp();
    this.baseline = comp;
    this.link = entry
      ? { kind: "saved", id: entry.id, revision: savedCompRevision(entry) }
      : { kind: "new" };
    this.current = {
      ...this.current,
      comp,
      savedId: entry?.id ?? null,
      dirty: false,
    };
    this.editorIdentity = Symbol();
    this.editorGeneration = Symbol();
    return this.current;
  }

  openImported(comp: Comp): SavedCompSessionState {
    this.load(null);
    this.current = {
      ...this.current,
      comp,
      dirty: !sameComp(comp, this.baseline),
    };
    return this.current;
  }

  async save(name: string, asCopy = false): Promise<SaveResult> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Enter a comp name before saving.");
    const originalName = this.current.comp.name;
    const comp = { ...this.current.comp, name: trimmed };
    const link = this.link;
    const identity = this.editorIdentity;
    const generation = this.editorGeneration;
    const id = asCopy || link.kind === "new" ? crypto.randomUUID() : link.id;
    const entry: SavedComp = {
      id,
      comp,
      updatedAt: new Date().toISOString(),
    };
    return this.runWrite(async () => {
      await this.write((current) => {
        if (generation !== this.editorGeneration)
          throw new Error(
            "Your comp changed while saving. Your edits were kept. Save again.",
          );
        if (!asCopy && link.kind === "saved") {
          const stored = current.find((item) => item.id === link.id);
          if (!stored || savedCompRevision(stored) !== link.revision)
            throw new Error(
              stored
                ? "This comp changed in another tab. Your edits were kept. Use Save As to save a copy, or load the saved comp to use that version."
                : "This comp was deleted in another tab. Your edits were kept. Use Save As to save a copy.",
            );
        }
        return [entry, ...current.filter((item) => item.id !== id)];
      });
      if (identity === this.editorIdentity) {
        this.baseline = comp;
        this.link = { kind: "saved", id, revision: savedCompRevision(entry) };
        const live = this.current.comp;
        const nextComp =
          live.name === originalName ? { ...live, name: trimmed } : live;
        this.current = {
          ...this.current,
          comp: nextComp,
          savedId: id,
          dirty: !sameComp(nextComp, this.baseline),
        };
        this.editorGeneration = Symbol();
      }
      await this.refresh();
      if (identity !== this.editorIdentity) return { kind: "differentEditor" };
      return { kind: this.current.dirty ? "newerEdits" : "clean" };
    });
  }

  async rename(id: string, name: string): Promise<void> {
    const identity = this.editorIdentity;
    const link = this.link;
    const originalName = this.current.comp.name;
    return this.runWrite(async () => {
      let renamedRevision: string | null = null;
      await this.write((current) =>
        current.map((entry) => {
          if (entry.id !== id) return entry;
          const nextEntry: SavedComp = {
            ...entry,
            comp: { ...entry.comp, name },
            updatedAt: new Date().toISOString(),
          };
          // A rename must not make stale editor content safe to overwrite.
          if (
            link.kind === "saved" &&
            link.id === id &&
            savedCompRevision(entry) === link.revision
          )
            renamedRevision = savedCompRevision(nextEntry);
          return nextEntry;
        }),
      );
      if (identity === this.editorIdentity && this.current.savedId === id) {
        const live = this.current.comp;
        const comp = live.name === originalName ? { ...live, name } : live;
        this.baseline = { ...this.baseline, name };
        if (renamedRevision !== null)
          this.link = { kind: "saved", id, revision: renamedRevision };
        this.current = {
          ...this.current,
          comp,
          dirty: !sameComp(comp, this.baseline),
        };
        this.editorGeneration = Symbol();
      }
      await this.refresh();
    });
  }

  async remove(id: string): Promise<void> {
    const identity = this.editorIdentity;
    return this.runWrite(async () => {
      await this.write((current) => current.filter((entry) => entry.id !== id));
      if (identity === this.editorIdentity && this.current.savedId === id) {
        this.link = { kind: "new" };
        this.baseline = emptyComp();
        this.current = {
          ...this.current,
          savedId: null,
          dirty: !sameComp(this.current.comp, this.baseline),
        };
        this.editorGeneration = Symbol();
      }
      await this.refresh();
    });
  }

  async importFile(file: CompImportFile): Promise<CompImportResult> {
    if (file.size > MAX_IMPORT_BYTES)
      throw new Error("The file must be smaller than 2 MB.");
    const source = await file.text();
    if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES)
      throw new Error("The file must be smaller than 2 MB.");
    const imported = parseCompLibrary(source);
    if (!imported.length) throw new Error("This file has no saved comps.");
    return this.runWrite(async () => {
      await this.write((current) => {
        const copies = imported.map((entry): SavedComp => ({
          ...entry,
          id: crypto.randomUUID(),
          updatedAt: new Date().toISOString(),
        }));
        return [...copies, ...current];
      });
      await this.refresh();
      return { count: imported.length };
    });
  }

  async exportData(entry?: SavedComp): Promise<string> {
    return entry
      ? serializeCompLibrary([entry])
      : ((await this.storage.read()) ?? serializeCompLibrary([]));
  }

  /** A library refresh never replaces local edits or makes a stale save safe. */
  async refresh(): Promise<void> {
    const generation = ++this.refreshGeneration;
    let library: SavedCompLibraryView;
    try {
      library = libraryView(decodeCompLibrary(await this.exportData()));
    } catch (error) {
      library = {
        entries: [],
        unavailableCount: 0,
        error: `Saved comps could not be read: ${errorMessage(error)}`,
      };
    }
    if (generation === this.refreshGeneration)
      this.current = { ...this.current, library };
  }

  private async runWrite<T>(operation: () => Promise<T>): Promise<T> {
    const writing = this.writeTail.then(operation);
    this.writeTail = writing.then(
      () => {},
      () => {},
    );
    try {
      return await writing;
    } catch (cause) {
      throw new SavedCompWriteError(cause);
    }
  }

  private write(
    update: (current: readonly SavedComp[]) => readonly SavedComp[],
  ): Promise<void> {
    return this.storage.update((stored) => {
      const current = decodeCompLibrary(stored ?? serializeCompLibrary([]));
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
      return source;
    });
  }
}
