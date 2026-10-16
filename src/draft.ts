import { HERO_BY_ID, TEAMS, otherTeam, type Team } from "./heroes";

export type DraftFormat = "mrc" | "ignite";

export const DRAFT_RULES = {
  mrc: {
    label: "MRC",
    bans: 3,
    saves: 2,
    scope: "Bans and saves apply to both teams.",
  },
  ignite: {
    label: "Ignite",
    bans: 5,
    saves: 2,
    scope: "Ban for the opponent. Save for your team.",
  },
} as const satisfies Record<
  DraftFormat,
  {
    readonly label: string;
    readonly bans: number;
    readonly saves: number;
    readonly scope: string;
  }
>;

export function describeDraftRules(format: DraftFormat): string {
  const { bans, saves, scope } = DRAFT_RULES[format];
  return `${bans} bans + ${saves} saves per team. ${scope}`;
}
export type DraftActionKind = "ban" | "save";

export interface DraftAction {
  readonly team: Team;
  readonly kind: DraftActionKind;
}

export interface LegacyDraftState {
  readonly format: DraftFormat;
  readonly firstTeam: Team;
  readonly choices: readonly string[];
}

interface LegacyDraftPhase {
  readonly index: number;
  readonly slots: readonly DraftSlot[];
  readonly heroIds: readonly string[];
}

interface LegacyDraftPhases {
  readonly complete: readonly LegacyDraftPhase[];
  readonly pending: LegacyDraftPhase | undefined;
}

export interface DraftProgress {
  readonly phaseIndex: number;
  readonly phase: readonly DraftAction[];
  readonly pendingChoices: readonly string[];
  readonly action: DraftAction | undefined;
}

export interface DraftEffects {
  readonly banned: Readonly<Record<Team, ReadonlySet<string>>>;
  readonly saved: Readonly<Record<Team, ReadonlySet<string>>>;
}

function actionTarget(format: DraftFormat, action: DraftAction): Team {
  if (format === "mrc" || action.kind === "save") return action.team;
  return otherTeam(action.team);
}

function draftPhases(
  draft: Pick<LegacyDraftState, "format" | "firstTeam">,
): readonly (readonly DraftAction[])[] {
  const t1 = draft.firstTeam;
  const t2 = otherTeam(t1);
  const ban = (team: Team): DraftAction => ({ team, kind: "ban" });
  const save = (team: Team): DraftAction => ({ team, kind: "save" });
  const both = [ban(t1), ban(t2)];
  return draft.format === "mrc"
    ? [
        [ban(t1)],
        [ban(t2)],
        [save(t2)],
        [save(t1)],
        [ban(t1)],
        [ban(t2)],
        [save(t2)],
        [save(t1)],
        [ban(t1)],
        [ban(t2)],
      ]
    : [
        both,
        [save(t1)],
        [ban(t2)],
        [save(t2)],
        [ban(t1)],
        both,
        [save(t2)],
        [ban(t1)],
        [save(t1)],
        [ban(t2)],
        both,
      ];
}

function legacyDraftPhases(draft: LegacyDraftState): LegacyDraftPhases {
  const slots = orderedDraftSlots(draft);
  const complete: LegacyDraftPhase[] = [];
  let offset = 0;
  for (const [index, phase] of draftPhases(draft).entries()) {
    const phaseSlots = slots.slice(offset, offset + phase.length);
    const heroIds = draft.choices.slice(offset, offset + phase.length);
    offset += phase.length;
    const current = { index, slots: phaseSlots, heroIds };
    if (heroIds.length < phase.length) return { complete, pending: current };
    complete.push(current);
  }
  return { complete, pending: undefined };
}

export function draftProgress(draft: LegacyDraftState): DraftProgress {
  const { pending } = legacyDraftPhases(draft);
  if (!pending)
    return {
      phaseIndex: draftPhases(draft).length,
      phase: [],
      pendingChoices: [],
      action: undefined,
    };
  return {
    phaseIndex: pending.index,
    phase: pending.slots,
    pendingChoices: pending.heroIds,
    action: pending.slots[pending.heroIds.length],
  };
}

export function legacyDraftEffects(
  draft: LegacyDraftState | null,
): DraftEffects {
  const banned: Record<Team, Set<string>> = {
    ally: new Set(),
    enemy: new Set(),
  };
  const saved: Record<Team, Set<string>> = {
    ally: new Set(),
    enemy: new Set(),
  };
  if (!draft) return { banned, saved };
  for (const phase of legacyDraftPhases(draft).complete)
    for (const [index, action] of phase.slots.entries()) {
      const heroId = phase.heroIds[index];
      if (!heroId) continue;
      const targets: readonly Team[] =
        draft.format === "mrc" ? TEAMS : [actionTarget(draft.format, action)];
      for (const target of targets) {
        (action.kind === "ban" ? banned : saved)[target].add(heroId);
      }
    }
  return { banned, saved };
}

export function legacyDraftChoiceError(
  draft: LegacyDraftState,
  heroId: string,
): string | null {
  if (!HERO_BY_ID.has(heroId)) return "Unknown hero.";
  const { action } = draftProgress(draft);
  if (!action) return "The draft is complete.";
  const target = actionTarget(draft.format, action);
  const effects = legacyDraftEffects(draft);
  if (effects.banned[target].has(heroId))
    return "Already banned for this team.";
  if (effects.saved[target].has(heroId)) return "Protected for this team.";
  return null;
}

export function chooseLegacyDraftHero(
  draft: LegacyDraftState,
  heroId: string,
): LegacyDraftState {
  const error = legacyDraftChoiceError(draft, heroId);
  if (error) throw new Error(error);
  return { ...draft, choices: [...draft.choices, heroId] };
}

export interface DraftTeamSlots {
  readonly ban: readonly (string | null)[];
  readonly save: readonly (string | null)[];
}

export interface DraftState {
  readonly format: DraftFormat;
  readonly teams: Readonly<Record<Team, DraftTeamSlots>>;
}

export interface DraftSlot extends DraftAction {
  readonly index: number;
}

export function emptyDraft(format: DraftFormat): DraftState {
  const slots = (): DraftTeamSlots => ({
    ban: Array.from({ length: DRAFT_RULES[format].bans }, () => null),
    save: Array.from({ length: DRAFT_RULES[format].saves }, () => null),
  });
  return { format, teams: { ally: slots(), enemy: slots() } };
}

function orderedDraftSlots(
  draft: Pick<LegacyDraftState, "format" | "firstTeam">,
): readonly DraftSlot[] {
  const counts: Record<Team, Record<DraftActionKind, number>> = {
    ally: { ban: 0, save: 0 },
    enemy: { ban: 0, save: 0 },
  };
  return draftPhases(draft)
    .flat()
    .map((action) => ({
      ...action,
      index: counts[action.team][action.kind]++,
    }));
}

export function draftSlots(
  draft: DraftState,
): readonly (DraftSlot & { readonly heroId: string | null })[] {
  return orderedDraftSlots({ format: draft.format, firstTeam: TEAMS[0] }).map(
    (slot) => ({
      ...slot,
      heroId: draft.teams[slot.team][slot.kind][slot.index] ?? null,
    }),
  );
}

export function draftEffects(draft: DraftState | null): DraftEffects {
  const banned: Record<Team, Set<string>> = {
    ally: new Set(),
    enemy: new Set(),
  };
  const saved: Record<Team, Set<string>> = {
    ally: new Set(),
    enemy: new Set(),
  };
  if (draft)
    for (const slot of draftSlots(draft)) {
      if (!slot.heroId) continue;
      const targets: readonly Team[] =
        draft.format === "mrc" ? TEAMS : [actionTarget(draft.format, slot)];
      for (const target of targets)
        (slot.kind === "ban" ? banned : saved)[target].add(slot.heroId);
    }
  return { banned, saved };
}

function validDraftSlot(draft: DraftState, slot: DraftSlot): boolean {
  return (
    Number.isInteger(slot.index) &&
    slot.index >= 0 &&
    slot.index < draft.teams[slot.team][slot.kind].length
  );
}

export function draftChoiceError(
  draft: DraftState,
  slot: DraftSlot,
  heroId: string,
): string | null {
  if (!HERO_BY_ID.has(heroId)) return "Unknown hero.";
  if (!validDraftSlot(draft, slot)) return "Invalid draft slot.";
  const target = actionTarget(draft.format, slot);
  for (const existing of draftSlots(draft)) {
    if (
      existing.heroId !== heroId ||
      (existing.team === slot.team &&
        existing.kind === slot.kind &&
        existing.index === slot.index)
    )
      continue;
    if (existing.kind === slot.kind) {
      if (
        existing.team === slot.team ||
        (slot.kind === "save" && draft.format === "mrc")
      )
        return "Already selected for this team.";
      continue;
    }
    if (
      draft.format === "mrc" ||
      actionTarget(draft.format, existing) === target
    )
      return slot.kind === "ban"
        ? "Protected for this team."
        : "Already banned for this team.";
  }
  return null;
}

export function setDraftHero(
  draft: DraftState,
  slot: DraftSlot,
  heroId: string | null,
): DraftState {
  if (!validDraftSlot(draft, slot)) throw new Error("Invalid draft slot.");
  const error = heroId === null ? null : draftChoiceError(draft, slot, heroId);
  if (error) throw new Error(error);
  return {
    ...draft,
    teams: {
      ...draft.teams,
      [slot.team]: {
        ...draft.teams[slot.team],
        [slot.kind]: draft.teams[slot.team][slot.kind].map((hero, index) =>
          index === slot.index ? heroId : hero,
        ),
      },
    },
  };
}

export function migrateLegacyDraft(draft: LegacyDraftState): DraftState {
  const { complete, pending } = legacyDraftPhases(draft);
  let result = emptyDraft(draft.format);
  for (const phase of pending ? [...complete, pending] : complete)
    for (const [index, heroId] of phase.heroIds.entries()) {
      const slot = phase.slots[index];
      if (slot) result = setDraftHero(result, slot, heroId);
    }
  return result;
}
