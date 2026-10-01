import { expect, test } from "@playwright/test";
import {
  applyCompEdit,
  compChoiceError,
  compStatus,
  hasDraftChoices,
  type CompHeroTarget,
} from "../src/compEdits";
import { emptyComp } from "../src/comps";
import type { DraftFormat } from "../src/draft";

const allySlot: CompHeroTarget = { kind: "slot", team: "ally", index: 0 };
const enemySlot: CompHeroTarget = { kind: "slot", team: "enemy", index: 0 };

test("hero replacement and removal preserve notes and discard old roles", () => {
  let comp = applyCompEdit(emptyComp(), {
    kind: "slotNotes",
    team: "ally",
    index: 0,
    notes: "Hold the corner.",
  });
  comp = applyCompEdit(comp, {
    kind: "chooseHero",
    target: enemySlot,
    selection: { heroId: "hulk" },
  });
  comp = applyCompEdit(comp, {
    kind: "chooseHero",
    target: allySlot,
    selection: { heroId: "deadpool", deadpoolRole: "Strategist" },
  });
  comp = applyCompEdit(comp, {
    kind: "deadpoolRole",
    team: "ally",
    index: 0,
    role: "Duelist",
  });
  expect(comp.teams.ally[0]).toEqual({
    heroId: "deadpool",
    deadpoolRole: "Duelist",
    notes: "Hold the corner.",
  });
  comp = applyCompEdit(comp, {
    kind: "chooseHero",
    target: allySlot,
    selection: { heroId: "hulk" },
  });
  expect(comp.teams.ally[0]).toEqual({
    heroId: "hulk",
    notes: "Hold the corner.",
  });
  expect(() =>
    applyCompEdit(comp, {
      kind: "deadpoolRole",
      team: "ally",
      index: 0,
      role: "Vanguard",
    }),
  ).toThrow("Invalid Deadpool role.");
  comp = applyCompEdit(comp, { kind: "clearHero", target: allySlot });
  expect(comp.teams.ally[0]).toEqual({
    heroId: null,
    notes: "Hold the corner.",
  });
  expect(comp.teams.enemy[0]).toEqual({ heroId: "hulk", notes: "" });
});

test("picker and edit rules agree on duplicates and team-scoped bans", () => {
  const formats: readonly DraftFormat[] = ["mrc", "ignite"];
  for (const format of formats) {
    let comp = applyCompEdit(emptyComp(), { kind: "draftFormat", format });
    comp = applyCompEdit(comp, {
      kind: "chooseHero",
      target: allySlot,
      selection: { heroId: "hulk" },
    });
    const secondAlly: CompHeroTarget = { kind: "slot", team: "ally", index: 1 };
    expect(compChoiceError(comp, secondAlly, "hulk")).toBe(
      "Already on this team.",
    );
    expect(() =>
      applyCompEdit(comp, {
        kind: "chooseHero",
        target: secondAlly,
        selection: { heroId: "hulk" },
      }),
    ).toThrow("Already on this team.");
    expect(compChoiceError(comp, enemySlot, "hulk")).toBeNull();
    comp = applyCompEdit(comp, {
      kind: "chooseHero",
      target: { kind: "draft", slot: { team: "enemy", kind: "ban", index: 0 } },
      selection: { heroId: "hulk" },
    });
    expect(compStatus(comp)).toBe("Conflict");
    expect(comp.teams.ally[0]).toEqual({ heroId: "hulk", notes: "" });
    expect(compChoiceError(comp, allySlot, "hulk")).toBe(
      "Banned for this team.",
    );
    expect(compChoiceError(comp, enemySlot, "hulk")).toBe(
      format === "mrc" ? "Banned for this team." : null,
    );
    expect(() =>
      applyCompEdit(comp, {
        kind: "chooseHero",
        target: allySlot,
        selection: { heroId: "hulk" },
      }),
    ).toThrow("Banned for this team.");
  }
});

test("map and draft resets preserve heroes and notes; team reset clears only its team", () => {
  let comp = applyCompEdit(emptyComp(), { kind: "name", value: "Dive" });
  comp = applyCompEdit(comp, { kind: "notes", value: "Take high ground." });
  comp = applyCompEdit(comp, {
    kind: "slotNotes",
    team: "ally",
    index: 0,
    notes: "Hold the corner.",
  });
  comp = applyCompEdit(comp, {
    kind: "chooseHero",
    target: allySlot,
    selection: { heroId: "strange" },
  });
  comp = applyCompEdit(comp, {
    kind: "chooseHero",
    target: enemySlot,
    selection: { heroId: "hulk" },
  });
  comp = applyCompEdit(comp, { kind: "draftFormat", format: "mrc" });
  const draftTarget: CompHeroTarget = {
    kind: "draft",
    slot: { team: "ally", kind: "save", index: 0 },
  };
  comp = applyCompEdit(comp, {
    kind: "chooseHero",
    target: draftTarget,
    selection: { heroId: "strange" },
  });
  expect(hasDraftChoices(comp)).toBe(true);
  comp = applyCompEdit(comp, { kind: "map", mapId: "midtown" });
  expect(comp.mapId).toBe("midtown");
  expect(comp.draft?.teams.ally).toEqual({
    ban: [null, null, null, null],
    save: [null, null],
  });
  comp = applyCompEdit(comp, {
    kind: "chooseHero",
    target: draftTarget,
    selection: { heroId: "strange" },
  });
  comp = applyCompEdit(comp, { kind: "clearHero", target: draftTarget });
  expect(hasDraftChoices(comp)).toBe(false);
  comp = applyCompEdit(comp, {
    kind: "chooseHero",
    target: draftTarget,
    selection: { heroId: "strange" },
  });
  comp = applyCompEdit(comp, { kind: "draftFormat", format: "ignite" });
  expect(comp.draft?.teams.ally).toEqual({
    ban: [null, null, null, null, null],
    save: [null, null],
  });
  comp = applyCompEdit(comp, {
    kind: "chooseHero",
    target: draftTarget,
    selection: { heroId: "strange" },
  });
  comp = applyCompEdit(comp, { kind: "resetDraft" });
  expect(comp.draft?.teams.ally.save).toEqual([null, null]);
  expect(comp.teams.ally[0]).toEqual({
    heroId: "strange",
    notes: "Hold the corner.",
  });
  expect(comp.name).toBe("Dive");
  expect(comp.notes).toBe("Take high ground.");
  comp = applyCompEdit(comp, { kind: "resetTeam", team: "ally" });
  expect(comp.teams.ally).toEqual([
    { heroId: null, notes: "" },
    { heroId: null, notes: "" },
    { heroId: null, notes: "" },
    { heroId: null, notes: "" },
    { heroId: null, notes: "" },
    { heroId: null, notes: "" },
  ]);
  expect(comp.teams.enemy[0]).toEqual({ heroId: "hulk", notes: "" });
  comp = applyCompEdit(comp, { kind: "draftFormat", format: null });
  expect(comp.draft).toBeNull();
  expect(comp.notes).toBe("Take high ground.");
});
