import { COMP_MAPS } from "./compMaps";
import {
  chooseLegacyDraftHero,
  emptyDraft,
  migrateLegacyDraft,
  setDraftHero,
  type DraftState,
  type LegacyDraftState,
  type DraftActionKind,
} from "./draft";
import {
  HERO_BY_ID,
  isDeadpoolRole,
  type DeadpoolRole,
  type Team,
} from "./heroes";

export interface CompSlot {
  readonly heroId: string | null;
  readonly notes: string;
  readonly deadpoolRole?: DeadpoolRole;
}

export interface Comp {
  readonly name: string;
  readonly notes: string;
  readonly mapId: string | null;
  readonly teams: Readonly<Record<Team, readonly CompSlot[]>>;
  readonly draft: DraftState | null;
}

export interface SavedComp {
  readonly id: string;
  readonly updatedAt: string;
  readonly comp: Comp;
}

export const COMP_STORAGE_KEY = "rivals-lab.comps.v1";
export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_SAVED_COMPS = 500;

export function compSlot(
  heroId: string | null,
  notes: string,
  deadpoolRole?: DeadpoolRole,
): CompSlot {
  if (deadpoolRole === undefined) return { heroId, notes };
  return { heroId, notes, deadpoolRole };
}

/** Slot shape, including omitted Deadpool role, is the equality form. */
export function sameComp(left: Comp, right: Comp): boolean {
  return (
    JSON.stringify(canonicalComp(left)) === JSON.stringify(canonicalComp(right))
  );
}

function canonicalComp(comp: Comp): Comp {
  const slots = (list: readonly CompSlot[]) =>
    list.map((slot) => compSlot(slot.heroId, slot.notes, slot.deadpoolRole));
  return {
    name: comp.name,
    notes: comp.notes,
    mapId: comp.mapId,
    teams: { ally: slots(comp.teams.ally), enemy: slots(comp.teams.enemy) },
    draft: comp.draft,
  };
}

export function emptyComp(): Comp {
  const slots = (): CompSlot[] =>
    Array.from({ length: 6 }, () => compSlot(null, ""));
  return {
    name: "",
    notes: "",
    mapId: null,
    teams: { ally: slots(), enemy: slots() },
    draft: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error("Invalid comp data. Expected an object.");
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || value.length > limit)
    throw new Error("Invalid or oversized text in comp data.");
  return value;
}

function items(value: unknown, limit: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > limit)
    throw new Error("Invalid or oversized list in comp data.");
  return value;
}

function decodeSlots(value: unknown): readonly CompSlot[] {
  const list = items(value, 6);
  if (list.length !== 6) throw new Error("Each team must have six slots.");
  const seen = new Set<string>();
  return list.map((item) => {
    const slot = record(item);
    const heroId = slot.heroId === null ? null : text(slot.heroId, 100);
    if (heroId !== null) {
      if (!HERO_BY_ID.has(heroId)) throw new Error(`Unknown hero: ${heroId}.`);
      if (seen.has(heroId))
        throw new Error("A team cannot contain duplicate heroes.");
      seen.add(heroId);
    }
    const notes = text(slot.notes, 10_000);
    if (slot.deadpoolRole !== undefined) {
      if (heroId !== "deadpool" || !isDeadpoolRole(slot.deadpoolRole))
        throw new Error("Invalid Deadpool role.");
      return compSlot(heroId, notes, slot.deadpoolRole);
    }
    return compSlot(heroId, notes);
  });
}

function decodeDraft(value: unknown): DraftState | null {
  if (value === null) return null;
  const draft = record(value);
  if (draft.format !== "mrc" && draft.format !== "ignite")
    throw new Error("Unknown draft format.");
  if (draft.teams !== undefined) {
    const teams = record(draft.teams);
    let result = emptyDraft(draft.format);
    const teamIds: readonly Team[] = ["ally", "enemy"];
    const kinds: readonly DraftActionKind[] = ["ban", "save"];
    for (const team of teamIds) {
      const slots = record(teams[team]);
      for (const kind of kinds) {
        const heroes = items(slots[kind], result.teams[team][kind].length);
        if (heroes.length !== result.teams[team][kind].length)
          throw new Error("Invalid draft slot count.");
        for (const [index, hero] of heroes.entries())
          result = setDraftHero(
            result,
            { team, kind, index },
            hero === null ? null : text(hero, 100),
          );
      }
    }
    return result;
  }
  if (draft.firstTeam !== "ally" && draft.firstTeam !== "enemy")
    throw new Error("Invalid first team.");
  let result: LegacyDraftState = {
    format: draft.format,
    firstTeam: draft.firstTeam,
    choices: [],
  };
  for (const hero of items(draft.choices, 14))
    result = chooseLegacyDraftHero(result, text(hero, 100));
  return migrateLegacyDraft(result);
}

function decodeCompWithName(
  value: unknown,
  decodeName: (name: unknown) => string,
): Comp {
  const comp = record(value);
  const teams = record(comp.teams);
  const mapId = comp.mapId === null ? null : text(comp.mapId, 100);
  if (mapId !== null && !COMP_MAPS.some((map) => map.id === mapId))
    throw new Error(`Unknown map: ${mapId}.`);
  return {
    name: decodeName(comp.name),
    notes: text(comp.notes, 10_000),
    mapId,
    teams: { ally: decodeSlots(teams.ally), enemy: decodeSlots(teams.enemy) },
    draft: decodeDraft(comp.draft),
  };
}

function decodeComp(value: unknown): Comp {
  return decodeCompWithName(value, (value) => {
    const name = text(value, 100).trim();
    if (!name) throw new Error("Each saved comp needs a name.");
    return name;
  });
}

export function decodeOpenComp(value: unknown): Comp {
  return decodeCompWithName(value, (name) => text(name, 100));
}

export interface CompLibrary {
  readonly entries: readonly SavedComp[];
  readonly unavailable: readonly unknown[];
  readonly errors: readonly string[];
  readonly envelope: Readonly<Record<string, unknown>>;
}

function decodeSavedComp(value: unknown): SavedComp {
  const saved = record(value);
  const id = text(saved.id, 100);
  if (!id) throw new Error("Invalid comp ID.");
  const updatedAt = text(saved.updatedAt, 40);
  if (!Number.isFinite(Date.parse(updatedAt)))
    throw new Error("Invalid comp date.");
  return { id, updatedAt, comp: decodeComp(saved.comp) };
}

/** Validate the envelope first, then isolate entries that cannot be loaded. */
export function decodeCompLibrary(source: string): CompLibrary {
  const data: unknown = JSON.parse(source);
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

/** Imports are atomic: reject files with unavailable entries without changing storage. */
export function parseCompLibrary(source: string): readonly SavedComp[] {
  const library = decodeCompLibrary(source);
  if (library.errors.length) throw new Error(library.errors.join(" "));
  return library.entries;
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
    parseCompLibrary(serializeCompLibrary(library.entries));
    const source = JSON.stringify({ ...library.envelope, comps }, null, 2);
    if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES)
      throw new Error(
        "The library limit is 2 MB. Export and remove older comps to make space.",
      );
    return new StoredLibrarySource(source);
  }
}

export function serializeCompLibrary(comps: readonly SavedComp[]): string {
  return JSON.stringify({ version: 1, comps }, null, 2);
}
