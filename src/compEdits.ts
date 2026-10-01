import { COMP_MAPS } from "./compMaps";
import { emptyComp, type Comp, type CompSlot } from "./comps";
import {
  draftChoiceError,
  draftEffects,
  draftSlots,
  emptyDraft,
  setDraftHero,
  type DraftFormat,
  type DraftSlot,
} from "./draft";
import {
  HERO_BY_ID,
  type DeadpoolRole,
  type HeroSelection,
  type Team,
} from "./heroes";

export type CompHeroTarget =
  | { readonly kind: "draft"; readonly slot: DraftSlot }
  | { readonly kind: "slot"; readonly team: Team; readonly index: number };

export type CompEdit =
  | { readonly kind: "name"; readonly value: string }
  | { readonly kind: "notes"; readonly value: string }
  | {
      readonly kind: "chooseHero";
      readonly target: CompHeroTarget;
      readonly selection: HeroSelection;
    }
  | { readonly kind: "clearHero"; readonly target: CompHeroTarget }
  | {
      readonly kind: "slotNotes";
      readonly team: Team;
      readonly index: number;
      readonly notes: string;
    }
  | {
      readonly kind: "deadpoolRole";
      readonly team: Team;
      readonly index: number;
      readonly role: DeadpoolRole;
    }
  | { readonly kind: "resetTeam"; readonly team: Team }
  | { readonly kind: "draftFormat"; readonly format: DraftFormat | null }
  | { readonly kind: "resetDraft" }
  | { readonly kind: "map"; readonly mapId: string | null };

export function compChoiceError(
  comp: Comp,
  target: CompHeroTarget,
  heroId: string,
): string | null {
  if (target.kind === "draft")
    return comp.draft
      ? draftChoiceError(comp.draft, target.slot, heroId)
      : "No draft selected.";
  if (!comp.teams[target.team][target.index]) return "Invalid comp slot.";
  if (!HERO_BY_ID.has(heroId)) return "Unknown hero.";
  if (draftEffects(comp.draft).banned[target.team].has(heroId))
    return "Banned for this team.";
  if (
    comp.teams[target.team].some(
      (slot, index) => index !== target.index && slot.heroId === heroId,
    )
  )
    return "Already on this team.";
  return null;
}

export function hasDraftChoices(comp: Comp): boolean {
  return (
    comp.draft !== null &&
    draftSlots(comp.draft).some((slot) => slot.heroId !== null)
  );
}

export function compStatus(comp: Comp): "Conflict" | "Incomplete" | "Ready" {
  const effects = draftEffects(comp.draft);
  if (
    comp.teams.ally.some(
      (slot) => slot.heroId && effects.banned.ally.has(slot.heroId),
    ) ||
    comp.teams.enemy.some(
      (slot) => slot.heroId && effects.banned.enemy.has(slot.heroId),
    )
  )
    return "Conflict";
  if (
    comp.teams.ally.some((slot) => !slot.heroId) ||
    (comp.draft && draftSlots(comp.draft).some((slot) => slot.heroId === null))
  )
    return "Incomplete";
  return "Ready";
}

function changeSlot(
  comp: Comp,
  team: Team,
  index: number,
  change: (slot: CompSlot) => CompSlot,
): Comp {
  const slot = comp.teams[team][index];
  if (!slot) throw new Error("Invalid comp slot.");
  const next = change(slot);
  return {
    ...comp,
    teams: {
      ...comp.teams,
      [team]: comp.teams[team].map((current, slotIndex) =>
        slotIndex === index ? next : current,
      ),
    },
  };
}

function changeHero(
  comp: Comp,
  target: CompHeroTarget,
  selection: HeroSelection | null,
): Comp {
  if (target.kind === "draft") {
    if (!comp.draft) throw new Error("No draft selected.");
    return {
      ...comp,
      draft: setDraftHero(comp.draft, target.slot, selection?.heroId ?? null),
    };
  }
  return changeSlot(comp, target.team, target.index, (slot) => ({
    ...selection,
    heroId: selection?.heroId ?? null,
    notes: slot.notes,
  }));
}

export function applyCompEdit(comp: Comp, edit: CompEdit): Comp {
  switch (edit.kind) {
    case "name":
      return { ...comp, name: edit.value };
    case "notes":
      return { ...comp, notes: edit.value };
    case "chooseHero": {
      const error = compChoiceError(comp, edit.target, edit.selection.heroId);
      if (error) throw new Error(error);
      if (
        edit.selection.deadpoolRole !== undefined &&
        edit.selection.heroId !== "deadpool"
      )
        throw new Error("Invalid Deadpool role.");
      return changeHero(comp, edit.target, edit.selection);
    }
    case "clearHero":
      return changeHero(comp, edit.target, null);
    case "slotNotes":
      return changeSlot(comp, edit.team, edit.index, (slot) => ({
        ...slot,
        notes: edit.notes,
      }));
    case "deadpoolRole":
      return changeSlot(comp, edit.team, edit.index, (slot) => {
        if (slot.heroId !== "deadpool")
          throw new Error("Invalid Deadpool role.");
        return { ...slot, deadpoolRole: edit.role };
      });
    case "resetTeam":
      return {
        ...comp,
        teams: { ...comp.teams, [edit.team]: emptyComp().teams[edit.team] },
      };
    case "draftFormat":
      return { ...comp, draft: edit.format ? emptyDraft(edit.format) : null };
    case "resetDraft":
      return {
        ...comp,
        draft: comp.draft ? emptyDraft(comp.draft.format) : null,
      };
    case "map":
      if (
        edit.mapId !== null &&
        !COMP_MAPS.some((map) => map.id === edit.mapId)
      )
        throw new Error(`Unknown map: ${edit.mapId}.`);
      return {
        ...comp,
        mapId: edit.mapId,
        draft: comp.draft ? emptyDraft(comp.draft.format) : null,
      };
    default: {
      const exhaustive: never = edit;
      return exhaustive;
    }
  }
}
