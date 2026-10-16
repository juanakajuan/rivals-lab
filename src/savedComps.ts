import {
  EMPTY_LIBRARY,
  decodeCompLibrary,
  libraryErrorSummary,
  savedCompRevision,
  serializeCompLibrary,
  type CompLibrary,
} from "./compLibrary";
import {
  decodeOpenComp,
  emptyComp,
  sameComp,
  type Comp,
  type SavedComp,
} from "./comps";
import { applyCompEdit, type CompEdit } from "./compEdits";
import { RULES } from "./heroes";
import type { CompStorage } from "./appData";
import { errorMessage } from "./errorMessage";

export interface SavedCompLibraryView {
  readonly entries: readonly SavedComp[];
  readonly error: string | null;
  readonly unavailableCount: number;
}

export interface SavedCompSnapshot {
  readonly comp: Comp;
  readonly savedId: string | null;
  readonly dirty: boolean;
  readonly openComp: OpenCompSnapshot;
  readonly library: SavedCompLibraryView;
}

export interface OpenCompSnapshot {
  readonly comp: Comp;
  readonly baseline: Comp;
  readonly saved: { readonly id: string; readonly baseline: Comp } | null;
}

export type OpenCompLink = "empty" | "unsaved" | "saved" | "detached";

export interface SavedCompSessionStart {
  readonly openComp: OpenCompSnapshot;
  readonly library: CompLibrary;
}

export function emptyOpenComp(): OpenCompSnapshot {
  return { comp: emptyComp(), baseline: emptyComp(), saved: null };
}

export function decodeOpenCompSnapshot(value: unknown): OpenCompSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid open comp.");
  const snapshot: Partial<Record<string, unknown>> = value;
  return {
    comp: decodeOpenComp(snapshot.comp),
    baseline: decodeOpenComp(snapshot.baseline),
    saved: decodeSavedLink(snapshot.saved),
  };
}

function decodeSavedLink(value: unknown): OpenCompSnapshot["saved"] {
  if (value === null) return null;
  if (typeof value !== "object" || value === undefined || Array.isArray(value))
    throw new Error("Invalid open comp link.");
  const link: Partial<Record<string, unknown>> = value;
  if (
    typeof link.id !== "string" ||
    !link.id ||
    link.id.length > RULES.idLength
  )
    throw new Error("Invalid open comp link.");
  return { id: link.id, baseline: decodeOpenComp(link.baseline) };
}

export function openCompLink(
  openComp: OpenCompSnapshot,
  entries: readonly SavedComp[],
): OpenCompLink {
  const { saved } = openComp;
  if (saved) {
    const entry = entries.find((item) => item.id === saved.id);
    return entry && sameComp(entry.comp, saved.baseline) ? "saved" : "detached";
  }
  const empty = emptyComp();
  return sameComp(openComp.comp, empty) && sameComp(openComp.baseline, empty)
    ? "empty"
    : "unsaved";
}

export type SaveResult =
  | { readonly kind: "clean" }
  | { readonly kind: "newerEdits" }
  | { readonly kind: "differentEditor" };

type EditorLink =
  | { readonly kind: "new" }
  | {
      readonly kind: "saved";
      readonly id: string;
      readonly revision: string;
      readonly baseline: Comp;
    };

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
      ? `${library.unavailable.length} saved comp(s) cannot be loaded. ${libraryErrorSummary(library)}`
      : null,
  };
}

function savedLink(entry: SavedComp): EditorLink {
  return {
    kind: "saved",
    id: entry.id,
    revision: savedCompRevision(entry),
    baseline: entry.comp,
  };
}

export class SavedCompSession {
  private baseline: Comp;
  private link: EditorLink;
  private current: SavedCompSnapshot;
  private readonly listeners = new Set<() => void>();
  private editorIdentity = Symbol();
  private editorGeneration = Symbol();
  private refreshGeneration = 0;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: CompStorage,
    start: SavedCompSessionStart = {
      openComp: emptyOpenComp(),
      library: EMPTY_LIBRARY,
    },
  ) {
    const { openComp, library } = start;
    const entry =
      openCompLink(openComp, library.entries) === "saved"
        ? library.entries.find((item) => item.id === openComp.saved?.id)
        : undefined;
    this.baseline = openComp.baseline;
    this.link = entry ? savedLink(entry) : { kind: "new" };
    this.current = this.editorSnapshot(openComp.comp, libraryView(library));
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): SavedCompSnapshot => this.current;

  edit(edit: CompEdit): void {
    const comp = applyCompEdit(this.current.comp, edit);
    this.editorGeneration = Symbol();
    this.publishEditor(comp);
  }

  load(entry: SavedComp | null): void {
    const comp = entry?.comp ?? emptyComp();
    this.baseline = comp;
    this.link = entry ? savedLink(entry) : { kind: "new" };
    this.editorIdentity = Symbol();
    this.editorGeneration = Symbol();
    this.publishEditor(comp);
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
        this.link = savedLink(entry);
        const live = this.current.comp;
        this.editorGeneration = Symbol();
        this.publishEditor(
          live.name === originalName ? { ...live, name: trimmed } : live,
        );
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
      let renamedLink: EditorLink | null = null;
      await this.write((current) =>
        current.map((entry) => {
          if (entry.id !== id) return entry;
          const nextEntry: SavedComp = {
            ...entry,
            comp: { ...entry.comp, name },
            updatedAt: new Date().toISOString(),
          };
          const editorSavedThisRevision =
            link.kind === "saved" &&
            link.id === id &&
            savedCompRevision(entry) === link.revision;
          if (editorSavedThisRevision) renamedLink = savedLink(nextEntry);
          return nextEntry;
        }),
      );
      if (identity === this.editorIdentity && this.current.savedId === id) {
        const live = this.current.comp;
        this.baseline = { ...this.baseline, name };
        if (renamedLink) this.link = renamedLink;
        this.editorGeneration = Symbol();
        this.publishEditor(
          live.name === originalName ? { ...live, name } : live,
        );
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
        this.editorGeneration = Symbol();
        this.publishEditor(this.current.comp);
      }
      await this.refresh();
    });
  }

  async exportData(entry?: SavedComp): Promise<string> {
    return entry
      ? serializeCompLibrary([entry])
      : ((await this.storage.read()) ?? serializeCompLibrary([]));
  }

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
      this.publish({ ...this.current, library });
  }

  private editorSnapshot(
    comp: Comp,
    library: SavedCompLibraryView,
  ): SavedCompSnapshot {
    const saved =
      this.link.kind === "saved"
        ? { id: this.link.id, baseline: this.link.baseline }
        : null;
    return {
      comp,
      savedId: saved?.id ?? null,
      dirty: !sameComp(comp, this.baseline),
      openComp: { comp, baseline: this.baseline, saved },
      library,
    };
  }

  private publishEditor(comp: Comp): void {
    this.publish(this.editorSnapshot(comp, this.current.library));
  }

  private publish(snapshot: SavedCompSnapshot): void {
    this.current = snapshot;
    for (const listener of this.listeners) listener();
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
    return this.storage.update((library) => ({
      ...library,
      entries: update(library.entries),
    }));
  }
}
