import {
  decodeSavedComp,
  isRecord,
  items,
  record,
  type SavedComp,
} from "./comps";

export const COMP_STORAGE_KEY = "rivals-lab.comps.v1";
export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_SAVED_COMPS = 500;
export const IMPORT_TOO_LARGE = "The file must be smaller than 2 MB.";
export const LIBRARY_TOO_LARGE =
  "The library limit is 2 MB. Export and remove older comps to make space.";

export interface CompLibrary {
  readonly entries: readonly SavedComp[];
  readonly unavailable: readonly unknown[];
  readonly errors: readonly string[];
  readonly envelope: Readonly<Record<string, unknown>>;
}

export const EMPTY_LIBRARY: CompLibrary = {
  entries: [],
  unavailable: [],
  errors: [],
  envelope: { version: 1, comps: [] },
};

export function decodeCompLibraryValue(data: unknown): CompLibrary {
  const envelope = record(data);
  if (envelope.version !== 1) throw new Error("Unsupported comp file version.");
  const raw = items(envelope.comps, MAX_SAVED_COMPS);
  const idCounts = new Map<string, number>();
  for (const item of raw)
    if (isRecord(item) && typeof item.id === "string")
      idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
  const entries: SavedComp[] = [];
  const unavailable: unknown[] = [];
  const errors: string[] = [];
  for (const item of raw) {
    try {
      if (
        isRecord(item) &&
        typeof item.id === "string" &&
        (idCounts.get(item.id) ?? 0) > 1
      )
        throw new Error("Duplicate comp ID.");
      entries.push(decodeSavedComp(item));
    } catch (error) {
      unavailable.push(item);
      errors.push(
        error instanceof Error ? error.message : "Invalid comp data.",
      );
    }
  }
  return { entries, unavailable, errors, envelope };
}

export function decodeCompLibrary(source: string): CompLibrary {
  const data: unknown = JSON.parse(source);
  return decodeCompLibraryValue(data);
}

export function libraryErrorSummary(library: CompLibrary): string {
  return [...new Set(library.errors)].join(" ");
}

export function parseCompLibraryStrict(source: string): readonly SavedComp[] {
  const library = decodeCompLibrary(source);
  if (library.errors.length) throw new Error(libraryErrorSummary(library));
  return library.entries;
}

export function serializeCompLibrary(comps: readonly SavedComp[]): string {
  return JSON.stringify({ version: 1, comps }, null, 2);
}

export function savedCompRevision(entry: SavedComp): string {
  return serializeCompLibrary([decodeSavedComp(entry)]);
}

export class StoredLibrarySource {
  private constructor(readonly text: string) {}

  static encode(library: CompLibrary): StoredLibrarySource {
    const ids = new Set(library.entries.map((entry) => entry.id));
    for (const item of library.unavailable)
      if (isRecord(item) && typeof item.id === "string" && ids.has(item.id))
        throw new Error("A comp ID belongs to an unavailable entry.");
    const comps = [...library.entries, ...library.unavailable];
    if (comps.length > MAX_SAVED_COMPS)
      throw new Error(`The library limit is ${MAX_SAVED_COMPS} comps.`);
    const checked = decodeCompLibraryValue({
      version: 1,
      comps: library.entries,
    });
    if (checked.errors.length) throw new Error(libraryErrorSummary(checked));
    const source = JSON.stringify({ ...library.envelope, comps }, null, 2);
    if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES)
      throw new Error(LIBRARY_TOO_LARGE);
    return new StoredLibrarySource(source);
  }
}

export function withCompCopies(
  library: CompLibrary,
  comps: readonly SavedComp[],
): CompLibrary {
  const updatedAt = new Date().toISOString();
  return {
    ...library,
    entries: [
      ...comps.map((entry): SavedComp => ({
        ...entry,
        id: crypto.randomUUID(),
        updatedAt,
      })),
      ...library.entries,
    ],
  };
}

export function updateLibrarySource(
  stored: string | null,
  transform: (library: CompLibrary) => CompLibrary,
): StoredLibrarySource {
  const current = decodeCompLibrary(stored ?? serializeCompLibrary([]));
  return StoredLibrarySource.encode(transform(current));
}
