import { HERO_BY_ID, type Team } from "./heroes";

export type DraftFormat = "mrc" | "ignite";
export type DraftActionKind = "ban" | "save";

export interface DraftAction {
  readonly team: Team;
  readonly kind: DraftActionKind;
}

export interface LegacyDraftState {
  readonly format: DraftFormat;
  readonly firstTeam: Team;
  /** Choices follow phase order. A joint phase takes effect only when complete. */
  readonly choices: readonly string[];
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

export function otherTeam(team: Team): Team {
  return team === "ally" ? "enemy" : "ally";
}

function actionTarget(format: DraftFormat, action: DraftAction): Team {
  if (format === "mrc" || action.kind === "save") return action.team;
  return otherTeam(action.team);
}

export function draftPhases(
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
        both,
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

export function draftProgress(draft: LegacyDraftState): DraftProgress {
  const phases = draftPhases(draft);
  let offset = 0;
  for (const [phaseIndex, phase] of phases.entries()) {
    if (draft.choices.length < offset + phase.length) {
      const pendingChoices = draft.choices.slice(offset);
      return {
        phaseIndex,
        phase,
        pendingChoices,
        action: phase[pendingChoices.length],
      };
    }
    offset += phase.length;
  }
  return {
    phaseIndex: phases.length,
    phase: [],
    pendingChoices: [],
    action: undefined,
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
  let offset = 0;
  for (const phase of draftPhases(draft)) {
    if (offset + phase.length > draft.choices.length) break;
    for (const [index, action] of phase.entries()) {
      const heroId = draft.choices[offset + index];
      if (!heroId) continue;
      const targets: readonly Team[] =
        draft.format === "mrc"
          ? ["ally", "enemy"]
          : [actionTarget(draft.format, action)];
      for (const target of targets) {
        (action.kind === "ban" ? banned : saved)[target].add(heroId);
      }
    }
    offset += phase.length;
  }
  return { banned, saved };
}

/** Returns an explanation for an unavailable choice, or null when legal. */
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
    ban: Array.from({ length: format === "mrc" ? 4 : 5 }, () => null),
    save: [null, null],
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

/** Display phase positions without requiring users to enter choices in order. */
export function draftSlots(
  draft: DraftState,
): readonly (DraftSlot & { readonly heroId: string | null })[] {
  return orderedDraftSlots({ format: draft.format, firstTeam: "ally" }).map(
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
        draft.format === "mrc"
          ? ["ally", "enemy"]
          : [actionTarget(draft.format, slot)];
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
  let result = emptyDraft(draft.format);
  for (const [index, slot] of orderedDraftSlots(draft).entries()) {
    const heroId = draft.choices[index];
    if (!heroId) break;
    result = setDraftHero(result, slot, heroId);
  }
  return result;
}
