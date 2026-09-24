import { expect, test } from '@playwright/test';
import { chooseDraftHero, draftChoiceError, draftEffects, draftProgress, type DraftState } from '../src/draft';
import { compStatus, emptyComp, parseCompLibrary, serializeCompLibrary, type SavedComp } from '../src/comps';
import { DEADPOOL_ROLES } from '../src/heroes';

test('MRC saves are global and the final duplicate ban takes effect atomically', () => {
  let draft: DraftState = { format: 'mrc', firstTeam: 'ally', choices: [] };
  for (const hero of ['angela', 'captain-america', 'strange', 'groot', 'hulk', 'magneto', 'peni-parker', 'rogue', 'the-hood', 'the-thing']) {
    draft = chooseDraftHero(draft, hero);
  }
  expect(draftEffects(draft).saved.ally).toEqual(draftEffects(draft).saved.enemy);
  expect(draftChoiceError(draft, 'strange')).toContain('Protected');
  expect(draftChoiceError(draft, 'hulk')).toContain('Already banned');
  const pending = chooseDraftHero(draft, 'thor');
  expect(draftProgress(pending).phaseIndex).toBe(10);
  expect(draftEffects(pending).banned.ally.has('thor')).toBe(false);
  const complete = chooseDraftHero(pending, 'thor');
  expect(draftProgress(complete).action).toBeUndefined();
  expect(draftEffects(complete).banned.ally.size).toBe(7);
  expect(draftEffects(complete).banned.ally).toEqual(draftEffects(complete).banned.enemy);
  expect(() => chooseDraftHero(complete, 'venom')).toThrow('complete');
  const undone = { ...complete, choices: complete.choices.slice(0, -1) };
  expect(draftEffects(undone).banned.enemy.has('thor')).toBe(false);
  expect(draftProgress(undone).pendingChoices).toEqual(['thor']);
});

test('Ignite bans target opponents, saves target allies, and first-team reversal preserves scope', () => {
  for (const firstTeam of ['ally', 'enemy'] as const) {
    const opponent = firstTeam === 'ally' ? 'enemy' : 'ally';
    let draft: DraftState = { format: 'ignite', firstTeam, choices: [] };
    draft = chooseDraftHero(draft, 'strange');
    expect(draftEffects(draft).banned[opponent].size).toBe(0);
    draft = chooseDraftHero(draft, 'hulk');
    expect(draftEffects(draft).banned[opponent].has('strange')).toBe(true);
    expect(draftChoiceError(draft, 'hulk')).toContain('banned');
    draft = chooseDraftHero(draft, 'luna');
    expect(draftChoiceError(draft, 'luna')).toContain('Protected');
    for (const hero of ['rocket', 'magneto']) draft = chooseDraftHero(draft, hero);
    expect(draftChoiceError(draft, 'magneto')).toContain('Protected');
    // A team may ban its own saved hero, because that ban targets the opponent.
    for (const hero of ['luna', 'thor', 'venom', 'groot', 'peni-parker', 'rogue', 'captain-america', 'the-thing', 'angela']) {
      draft = chooseDraftHero(draft, hero);
    }
    const effects = draftEffects(draft);
    expect(effects.saved[firstTeam].has('luna')).toBe(true);
    expect(effects.banned[opponent].has('luna')).toBe(true);
    expect(effects.banned[firstTeam].has('luna')).toBe(false);
    expect(effects.banned.ally.size).toBe(5);
    expect(effects.banned.enemy.size).toBe(5);
    expect(effects.saved.ally.size).toBe(2);
    expect(effects.saved.enemy.size).toBe(2);
    expect(draftProgress(draft).action).toBeUndefined();
  }
});

test('saved comps validate external data and preserve partial drafts and conflicts', () => {
  const comp = emptyComp();
  const entry: SavedComp = {
    id: 'example', updatedAt: '2026-09-23T12:00:00Z',
    comp: { ...comp, name: 'Dive', draft: { format: 'ignite', firstTeam: 'ally', choices: ['strange'] } }
  };
  expect(parseCompLibrary(serializeCompLibrary([entry]))).toEqual([entry]);
  const invalidValues: readonly unknown[] = [
    { version: 2, comps: [entry] },
    { version: 1, comps: [entry, entry] },
    { version: 1, comps: [{ ...entry, comp: { ...entry.comp, mapId: 'unknown' } }] },
    { version: 1, comps: [{ ...entry, comp: { ...entry.comp, teams: { ally: [], enemy: [] } } }] },
    { version: 1, comps: [{ ...entry, comp: { ...entry.comp, draft: { format: 'mrc', firstTeam: 'ally', choices: ['strange', 'strange'] } } }] },
    { version: 1, comps: [{ ...entry, comp: { ...entry.comp, draft: { format: 'ignite', firstTeam: 'ally', choices: ['not-a-hero'] } } }] }
  ];
  for (const value of invalidValues) expect(() => parseCompLibrary(JSON.stringify(value))).toThrow();
  const conflict = {
    ...entry.comp, draft: { format: 'mrc', firstTeam: 'ally', choices: ['strange'] } as const,
    teams: { ...comp.teams, ally: comp.teams.ally.map((slot, index) => index === 0 ? { ...slot, heroId: 'strange' } : slot) }
  };
  expect(compStatus(conflict)).toBe('Conflict');
  expect(parseCompLibrary(serializeCompLibrary([{ ...entry, comp: conflict }]))[0]?.comp).toEqual(conflict);
});

test('Deadpool roles round-trip, legacy saves load, and invalid role data is rejected', () => {
  const comp = emptyComp();
  const entry: SavedComp = {
    id: 'deadpool', updatedAt: '2026-09-24T12:00:00Z',
    comp: { ...comp, name: 'Deadpool comp', teams: { ...comp.teams,
      ally: comp.teams.ally.map((slot, index) => index === 0 ? { ...slot, heroId: 'deadpool' } : slot)
    } }
  };
  expect(parseCompLibrary(serializeCompLibrary([entry]))).toEqual([entry]);
  for (const deadpoolRole of DEADPOOL_ROLES) {
    const withRole: SavedComp = { ...entry, comp: { ...entry.comp, teams: { ...entry.comp.teams,
      ally: entry.comp.teams.ally.map((slot, index) => index === 0 ? { ...slot, deadpoolRole } : slot)
    } } };
    expect(parseCompLibrary(serializeCompLibrary([withRole]))).toEqual([withRole]);
  }
  for (const invalidSlot of [
    { heroId: 'deadpool', deadpoolRole: 'Tank', notes: '' },
    { heroId: 'hulk', deadpoolRole: 'Strategist', notes: '' },
    { heroId: null, deadpoolRole: 'Duelist', notes: '' }
  ]) {
    const invalid = { ...entry, comp: { ...entry.comp, teams: { ...entry.comp.teams,
      ally: entry.comp.teams.ally.map((slot, index) => index === 0 ? invalidSlot : slot)
    } } };
    expect(() => parseCompLibrary(JSON.stringify({ version: 1, comps: [invalid] }))).toThrow('Invalid Deadpool role');
  }
});
