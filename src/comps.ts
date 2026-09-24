import { COMP_MAPS } from './compMaps';
import { chooseDraftHero, draftEffects, draftProgress, type DraftState } from './draft';
import { HERO_BY_ID, isDeadpoolRole, type DeadpoolRole, type Team } from './heroes';

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

export const COMP_STORAGE_KEY = 'rivals-lab.comps.v1';
export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_SAVED_COMPS = 500;

export function emptyComp(): Comp {
  const slots = (): CompSlot[] => Array.from({ length: 6 }, () => ({ heroId: null, notes: '' }));
  return { name: '', notes: '', mapId: null, teams: { ally: slots(), enemy: slots() }, draft: null };
}

export function compStatus(comp: Comp): 'Conflict' | 'Incomplete' | 'Ready' {
  const effects = draftEffects(comp.draft);
  if (comp.teams.ally.some((slot) => slot.heroId && effects.banned.ally.has(slot.heroId)) ||
    comp.teams.enemy.some((slot) => slot.heroId && effects.banned.enemy.has(slot.heroId))) return 'Conflict';
  if (comp.teams.ally.some((slot) => !slot.heroId) ||
    (comp.draft && draftProgress(comp.draft).action)) return 'Incomplete';
  return 'Ready';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid comp data. Expected an object.');
  return value;
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid or oversized text in comp data.');
  return value;
}

function items(value: unknown, limit: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error('Invalid or oversized list in comp data.');
  return value;
}

function decodeSlots(value: unknown): readonly CompSlot[] {
  const list = items(value, 6);
  if (list.length !== 6) throw new Error('Each team must have six slots.');
  const seen = new Set<string>();
  return list.map((item) => {
    const slot = record(item);
    const heroId = slot.heroId === null ? null : text(slot.heroId, 100);
    if (heroId !== null) {
      if (!HERO_BY_ID.has(heroId)) throw new Error(`Unknown hero: ${heroId}.`);
      if (seen.has(heroId)) throw new Error('A team cannot contain duplicate heroes.');
      seen.add(heroId);
    }
    const notes = text(slot.notes, 10_000);
    if (slot.deadpoolRole !== undefined) {
      if (heroId !== 'deadpool' || !isDeadpoolRole(slot.deadpoolRole)) throw new Error('Invalid Deadpool role.');
      return { heroId, notes, deadpoolRole: slot.deadpoolRole };
    }
    // Older files did not record a Deadpool role. Keep those slots editable.
    return { heroId, notes };
  });
}

function decodeDraft(value: unknown): DraftState | null {
  if (value === null) return null;
  const draft = record(value);
  if (draft.format !== 'mrc' && draft.format !== 'ignite') throw new Error('Unknown draft format.');
  if (draft.firstTeam !== 'ally' && draft.firstTeam !== 'enemy') throw new Error('Invalid first team.');
  let result: DraftState = { format: draft.format, firstTeam: draft.firstTeam, choices: [] };
  for (const hero of items(draft.choices, 14)) result = chooseDraftHero(result, text(hero, 100));
  return result;
}

function decodeComp(value: unknown): Comp {
  const comp = record(value);
  const teams = record(comp.teams);
  const mapId = comp.mapId === null ? null : text(comp.mapId, 100);
  if (mapId !== null && !COMP_MAPS.some((map) => map.id === mapId)) throw new Error(`Unknown map: ${mapId}.`);
  const name = text(comp.name, 100).trim();
  if (!name) throw new Error('Each saved comp needs a name.');
  return {
    name, notes: text(comp.notes, 10_000), mapId,
    teams: { ally: decodeSlots(teams.ally), enemy: decodeSlots(teams.enemy) },
    draft: decodeDraft(comp.draft)
  };
}

/** All browser storage and imported files enter through this validator. */
export function parseCompLibrary(source: string): readonly SavedComp[] {
  const data: unknown = JSON.parse(source);
  const envelope = record(data);
  if (envelope.version !== 1) throw new Error('Unsupported comp file version.');
  const ids = new Set<string>();
  return items(envelope.comps, MAX_SAVED_COMPS).map((item) => {
    const saved = record(item);
    const id = text(saved.id, 100);
    if (!id || ids.has(id)) throw new Error('Invalid or duplicate comp ID.');
    ids.add(id);
    const updatedAt = text(saved.updatedAt, 40);
    if (!Number.isFinite(Date.parse(updatedAt))) throw new Error('Invalid comp date.');
    return { id, updatedAt, comp: decodeComp(saved.comp) };
  });
}

export function serializeCompLibrary(comps: readonly SavedComp[]): string {
  return JSON.stringify({ version: 1, comps }, null, 2);
}

export function readCompLibrary(): readonly SavedComp[] {
  const source = localStorage.getItem(COMP_STORAGE_KEY);
  return source === null ? [] : parseCompLibrary(source);
}

/** Re-read before each write to preserve changes made in other tabs. */
export function updateCompLibrary(
  update: (current: readonly SavedComp[]) => readonly SavedComp[]
): readonly SavedComp[] {
  const next = update(readCompLibrary());
  if (next.length > MAX_SAVED_COMPS) throw new Error(`The library limit is ${MAX_SAVED_COMPS} comps.`);
  const source = serializeCompLibrary(next);
  if (new TextEncoder().encode(source).byteLength > MAX_IMPORT_BYTES) {
    throw new Error('The library limit is 2 MB. Export and remove older comps to make space.');
  }
  parseCompLibrary(source);
  localStorage.setItem(COMP_STORAGE_KEY, source);
  return next;
}
