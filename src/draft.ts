import { HERO_BY_ID, type Team } from "./heroes";

export type DraftFormat = "mrc" | "ignite";
export type DraftActionKind = "ban" | "save";

export interface DraftAction {
  readonly team: Team;
  readonly kind: DraftActionKind;
}

export interface DraftState {
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
  draft: Pick<DraftState, "format" | "firstTeam">,
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

export function draftProgress(draft: DraftState): DraftProgress {
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

export function draftEffects(draft: DraftState | null): DraftEffects {
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
export function draftChoiceError(
  draft: DraftState,
  heroId: string,
): string | null {
  if (!HERO_BY_ID.has(heroId)) return "Unknown hero.";
  const { action } = draftProgress(draft);
  if (!action) return "The draft is complete.";
  const target = actionTarget(draft.format, action);
  const effects = draftEffects(draft);
  if (effects.banned[target].has(heroId))
    return "Already banned for this team.";
  if (effects.saved[target].has(heroId)) return "Protected for this team.";
  return null;
}

export function chooseDraftHero(draft: DraftState, heroId: string): DraftState {
  const error = draftChoiceError(draft, heroId);
  if (error) throw new Error(error);
  return { ...draft, choices: [...draft.choices, heroId] };
}
