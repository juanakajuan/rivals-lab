import type { CompMapSelection } from "./compMaps";
import { MAPS, findMap, isGameMode } from "./maps";
import {
  chooseLegacyDraftHero,
  draftSlots,
  emptyDraft,
  migrateLegacyDraft,
  setDraftHero,
  type DraftState,
  type LegacyDraftState,
  type DraftActionKind,
} from "./draft";
import {
  HERO_BY_ID,
  RULES,
  TEAMS,
  TEAM_SIZE,
  isDeadpoolRole,
  isTeam,
  type DeadpoolRole,
  type Team,
} from "./heroes";

export interface CompSlot {
  readonly heroId: string | null;
  readonly notes: string;
  readonly deadpoolRole?: DeadpoolRole;
}

interface CompContent {
  readonly name: string;
  readonly notes: string;
  readonly teams: Readonly<Record<Team, readonly CompSlot[]>>;
  readonly draft: DraftState | null;
}

export type Comp = CompContent & CompMapSelection;

export interface SavedComp {
  readonly id: string;
  readonly updatedAt: string;
  readonly comp: Comp;
}

export const MAX_COMP_MAPS = MAPS.length;

export function compSlot(
  heroId: string | null,
  notes: string,
  deadpoolRole?: DeadpoolRole,
): CompSlot {
  if (deadpoolRole === undefined) return { heroId, notes };
  return { heroId, notes, deadpoolRole };
}

export function sameComp(left: Comp, right: Comp): boolean {
  return (
    JSON.stringify(canonicalComp(left)) === JSON.stringify(canonicalComp(right))
  );
}

function mapSelection(selection: CompMapSelection): CompMapSelection {
  return selection.gameMode === null
    ? { mapIds: selection.mapIds, gameMode: null }
    : { mapIds: [], gameMode: selection.gameMode };
}

function canonicalComp(comp: Comp): Comp {
  const slots = (list: readonly CompSlot[]) =>
    list.map((slot) => compSlot(slot.heroId, slot.notes, slot.deadpoolRole));
  return {
    name: comp.name,
    notes: comp.notes,
    ...mapSelection(comp),
    teams: { ally: slots(comp.teams.ally), enemy: slots(comp.teams.enemy) },
    draft: comp.draft,
  };
}

export function emptyComp(): Comp {
  const slots = (): CompSlot[] =>
    Array.from({ length: TEAM_SIZE }, () => compSlot(null, ""));
  return {
    name: "",
    notes: "",
    mapIds: [],
    gameMode: null,
    teams: { ally: slots(), enemy: slots() },
    draft: null,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error("Invalid comp data. Expected an object.");
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== "string" || value.length > limit)
    throw new Error("Invalid or oversized text in comp data.");
  return value;
}

export function items(value: unknown, limit: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > limit)
    throw new Error("Invalid or oversized list in comp data.");
  return value;
}

function decodeSlots(value: unknown): readonly CompSlot[] {
  const list = items(value, TEAM_SIZE);
  if (list.length !== TEAM_SIZE)
    throw new Error(`Each team must have ${TEAM_SIZE} slots.`);
  const seen = new Set<string>();
  return list.map((item) => {
    const slot = record(item);
    const heroId =
      slot.heroId === null ? null : text(slot.heroId, RULES.idLength);
    if (heroId !== null) {
      if (!HERO_BY_ID.has(heroId)) throw new Error(`Unknown hero: ${heroId}.`);
      if (seen.has(heroId))
        throw new Error("A team cannot contain duplicate heroes.");
      seen.add(heroId);
    }
    const notes = text(slot.notes, RULES.notesLength);
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
  const legacyMrcTrailingBans = draft.format === "mrc" ? 1 : 0;
  if (draft.teams !== undefined) {
    const teams = record(draft.teams);
    let result = emptyDraft(draft.format);
    const kinds: readonly DraftActionKind[] = ["ban", "save"];
    for (const team of TEAMS) {
      const slots = record(teams[team]);
      for (const kind of kinds) {
        const length = result.teams[team][kind].length;
        const max = kind === "ban" ? length + legacyMrcTrailingBans : length;
        const heroes = items(slots[kind], max);
        if (heroes.length !== length && heroes.length !== max)
          throw new Error("Invalid draft slot count.");
        for (const [index, hero] of heroes.slice(0, length).entries())
          result = setDraftHero(
            result,
            { team, kind, index },
            hero === null ? null : text(hero, RULES.idLength),
          );
      }
    }
    return result;
  }
  if (!isTeam(draft.firstTeam)) throw new Error("Invalid first team.");
  let result: LegacyDraftState = {
    format: draft.format,
    firstTeam: draft.firstTeam,
    choices: [],
  };
  const actions = draftSlots(emptyDraft(draft.format)).length;
  const legacyJointBanChoices = TEAMS.length * legacyMrcTrailingBans;
  for (const hero of items(
    draft.choices,
    actions + legacyJointBanChoices,
  ).slice(0, actions))
    result = chooseLegacyDraftHero(result, text(hero, RULES.idLength));
  return migrateLegacyDraft(result);
}

function decodeMapSelectionOrLegacyMapId(
  comp: Record<string, unknown>,
): CompMapSelection {
  let storedIds: readonly string[];
  if (comp.mapIds !== undefined)
    storedIds = items(comp.mapIds, MAX_COMP_MAPS).map((id) =>
      text(id, RULES.idLength),
    );
  else if (comp.mapId === undefined || comp.mapId === null) storedIds = [];
  else storedIds = [text(comp.mapId, RULES.idLength)];
  const mapIds = storedIds.map((id) => {
    const map = findMap(id);
    if (!map) throw new Error(`Unknown map: ${id}.`);
    return map.id;
  });
  if (new Set(mapIds).size !== mapIds.length)
    throw new Error("A map appears twice in one comp.");
  const gameMode = comp.gameMode ?? null;
  if (gameMode === null) return { mapIds, gameMode };
  if (!isGameMode(gameMode)) throw new Error("Unknown game mode.");
  if (mapIds.length)
    throw new Error("A comp cannot use a game mode and specific maps.");
  return { mapIds: [], gameMode };
}

function decodeCompWithName(
  value: unknown,
  decodeName: (name: unknown) => string,
): Comp {
  const comp = record(value);
  const teams = record(comp.teams);
  return {
    name: decodeName(comp.name),
    notes: text(comp.notes, RULES.notesLength),
    ...decodeMapSelectionOrLegacyMapId(comp),
    teams: { ally: decodeSlots(teams.ally), enemy: decodeSlots(teams.enemy) },
    draft: decodeDraft(comp.draft),
  };
}

function decodeComp(value: unknown): Comp {
  return decodeCompWithName(value, (value) => {
    const name = text(value, RULES.nameLength).trim();
    if (!name) throw new Error("Each saved comp needs a name.");
    return name;
  });
}

export function decodeOpenComp(value: unknown): Comp {
  return decodeCompWithName(value, (name) => text(name, RULES.nameLength));
}

export function decodeSavedComp(value: unknown): SavedComp {
  const saved = record(value);
  const id = text(saved.id, RULES.idLength);
  if (!id) throw new Error("Invalid comp ID.");
  const updatedAt = text(saved.updatedAt, RULES.timestampLength);
  if (!Number.isFinite(Date.parse(updatedAt)))
    throw new Error("Invalid comp date.");
  return { id, updatedAt, comp: decodeComp(saved.comp) };
}
