import { expect, test } from "@playwright/test";
import {
  chooseLegacyDraftHero as chooseDraftHero,
  legacyDraftChoiceError as draftChoiceError,
  legacyDraftEffects as draftEffects,
  draftEffects as slotEffects,
  draftSlots,
  emptyDraft,
  setDraftHero,
  migrateLegacyDraft,
  draftProgress,
  type LegacyDraftState as DraftState,
} from "../src/draft";
import { emptyComp, type SavedComp } from "../src/comps";
import {
  decodeCompLibrary,
  parseCompLibraryStrict,
  serializeCompLibrary,
} from "../src/compLibrary";
import { compStatus } from "../src/compEdits";
import { DEADPOOL_ROLES } from "../src/heroes";

test("MRC bans and saves are global and the draft ends after Ban 3", () => {
  let draft: DraftState = { format: "mrc", firstTeam: "ally", choices: [] };
  for (const hero of [
    "angela",
    "captain-america",
    "strange",
    "groot",
    "hulk",
    "magneto",
    "peni-parker",
    "rogue",
    "the-hood",
    "the-thing",
  ]) {
    draft = chooseDraftHero(draft, hero);
  }
  expect(draftEffects(draft).saved.ally).toEqual(
    draftEffects(draft).saved.enemy,
  );
  expect(draftProgress(draft).phaseIndex).toBe(10);
  expect(draftProgress(draft).action).toBeUndefined();
  expect(draftEffects(draft).banned.ally.size).toBe(6);
  expect(draftEffects(draft).banned.ally).toEqual(
    draftEffects(draft).banned.enemy,
  );
  expect(() => chooseDraftHero(draft, "thor")).toThrow(
    "The draft is complete.",
  );
  const undone = { ...draft, choices: draft.choices.slice(0, -1) };
  expect(draftProgress(undone).action).toEqual({
    team: "enemy",
    kind: "ban",
    index: 2,
  });
  expect(draftProgress(undone).pendingChoices).toEqual([]);
  expect(draftEffects(undone).banned.enemy.has("the-thing")).toBe(false);
  expect(draftChoiceError(undone, "strange")).toBe("Protected for this team.");
  expect(draftChoiceError(undone, "hulk")).toBe(
    "Already banned for this team.",
  );
});

test("an empty MRC draft has three bans and two saves and no fourth ban slot", () => {
  expect(emptyDraft("mrc")).toEqual({
    format: "mrc",
    teams: {
      ally: { ban: [null, null, null], save: [null, null] },
      enemy: { ban: [null, null, null], save: [null, null] },
    },
  });
  expect(
    draftSlots(emptyDraft("mrc")).map(
      ({ team, kind, index }) => `${team} ${kind} ${index}`,
    ),
  ).toEqual([
    "ally ban 0",
    "enemy ban 0",
    "enemy save 0",
    "ally save 0",
    "ally ban 1",
    "enemy ban 1",
    "enemy save 1",
    "ally save 1",
    "ally ban 2",
    "enemy ban 2",
  ]);
});

test("Ignite bans target opponents, saves target allies, and first-team reversal preserves scope", () => {
  for (const firstTeam of ["ally", "enemy"] as const) {
    const opponent = firstTeam === "ally" ? "enemy" : "ally";
    let draft: DraftState = { format: "ignite", firstTeam, choices: [] };
    draft = chooseDraftHero(draft, "strange");
    expect(draftEffects(draft).banned[opponent].size).toBe(0);
    draft = chooseDraftHero(draft, "hulk");
    expect(draftEffects(draft).banned[opponent].has("strange")).toBe(true);
    expect(draftChoiceError(draft, "hulk")).toContain("banned");
    draft = chooseDraftHero(draft, "luna");
    expect(draftChoiceError(draft, "luna")).toContain("Protected");
    for (const hero of ["rocket", "magneto"])
      draft = chooseDraftHero(draft, hero);
    expect(draftChoiceError(draft, "magneto")).toContain("Protected");
    for (const hero of [
      "luna",
      "thor",
      "venom",
      "groot",
      "peni-parker",
      "rogue",
      "captain-america",
      "the-thing",
      "angela",
    ]) {
      draft = chooseDraftHero(draft, hero);
    }
    const effects = draftEffects(draft);
    expect(effects.saved[firstTeam].has("luna")).toBe(true);
    expect(effects.banned[opponent].has("luna")).toBe(true);
    expect(effects.banned[firstTeam].has("luna")).toBe(false);
    expect(effects.banned.ally.size).toBe(5);
    expect(effects.banned.enemy.size).toBe(5);
    expect(effects.saved.ally.size).toBe(2);
    expect(effects.saved.enemy.size).toBe(2);
    expect(draftProgress(draft).action).toBeUndefined();
  }
});

test("saved comps validate external data and preserve partial drafts and conflicts", () => {
  const comp = emptyComp();
  const entry: SavedComp = {
    id: "example",
    updatedAt: "2026-09-23T12:00:00Z",
    comp: {
      ...comp,
      name: "Dive",
      draft: setDraftHero(
        emptyDraft("ignite"),
        { team: "ally", kind: "ban", index: 0 },
        "strange",
      ),
    },
  };
  expect(parseCompLibraryStrict(serializeCompLibrary([entry]))).toEqual([
    entry,
  ]);
  const invalidValues: readonly unknown[] = [
    { version: 2, comps: [entry] },
    { version: 1, comps: [entry, entry] },
    {
      version: 1,
      comps: [{ ...entry, comp: { ...entry.comp, mapIds: ["unknown"] } }],
    },
    {
      version: 1,
      comps: [
        { ...entry, comp: { ...entry.comp, teams: { ally: [], enemy: [] } } },
      ],
    },
    {
      version: 1,
      comps: [
        {
          ...entry,
          comp: {
            ...entry.comp,
            draft: {
              format: "mrc",
              firstTeam: "ally",
              choices: ["strange", "strange"],
            },
          },
        },
      ],
    },
    {
      version: 1,
      comps: [
        {
          ...entry,
          comp: {
            ...entry.comp,
            draft: {
              format: "ignite",
              firstTeam: "ally",
              choices: ["not-a-hero"],
            },
          },
        },
      ],
    },
  ];
  for (const value of invalidValues)
    expect(() => parseCompLibraryStrict(JSON.stringify(value))).toThrow();
  const conflict = {
    ...entry.comp,
    draft: setDraftHero(
      emptyDraft("mrc"),
      { team: "ally", kind: "ban", index: 0 },
      "strange",
    ),
    teams: {
      ...comp.teams,
      ally: comp.teams.ally.map((slot, index) =>
        index === 0 ? { ...slot, heroId: "strange" } : slot,
      ),
    },
  };
  expect(compStatus(conflict)).toBe("Conflict");
  expect(
    parseCompLibraryStrict(
      serializeCompLibrary([{ ...entry, comp: conflict }]),
    )[0]?.comp,
  ).toEqual(conflict);
});

test("Deadpool roles round-trip, legacy saves load, and invalid role data is rejected", () => {
  const comp = emptyComp();
  const entry: SavedComp = {
    id: "deadpool",
    updatedAt: "2026-09-24T12:00:00Z",
    comp: {
      ...comp,
      name: "Deadpool comp",
      teams: {
        ...comp.teams,
        ally: comp.teams.ally.map((slot, index) =>
          index === 0 ? { ...slot, heroId: "deadpool" } : slot,
        ),
      },
    },
  };
  expect(parseCompLibraryStrict(serializeCompLibrary([entry]))).toEqual([
    entry,
  ]);
  for (const deadpoolRole of DEADPOOL_ROLES) {
    const withRole: SavedComp = {
      ...entry,
      comp: {
        ...entry.comp,
        teams: {
          ...entry.comp.teams,
          ally: entry.comp.teams.ally.map((slot, index) =>
            index === 0 ? { ...slot, deadpoolRole } : slot,
          ),
        },
      },
    };
    expect(parseCompLibraryStrict(serializeCompLibrary([withRole]))).toEqual([
      withRole,
    ]);
  }
  for (const invalidSlot of [
    { heroId: "deadpool", deadpoolRole: "Tank", notes: "" },
    { heroId: "hulk", deadpoolRole: "Strategist", notes: "" },
    { heroId: null, deadpoolRole: "Duelist", notes: "" },
  ]) {
    const invalid = {
      ...entry,
      comp: {
        ...entry.comp,
        teams: {
          ...entry.comp.teams,
          ally: entry.comp.teams.ally.map((slot, index) =>
            index === 0 ? invalidSlot : slot,
          ),
        },
      },
    };
    expect(() =>
      parseCompLibraryStrict(JSON.stringify({ version: 1, comps: [invalid] })),
    ).toThrow("Invalid Deadpool role");
  }
});

test("direct slots apply at once and allow replace, clear, and legal cross-team bans", () => {
  for (const format of ["mrc", "ignite"] as const) {
    const allyBan = {
      team: "ally",
      kind: "ban",
      index: format === "mrc" ? 2 : 4,
    } as const;
    const enemyBan = { team: "enemy", kind: "ban", index: 0 } as const;
    let draft = setDraftHero(emptyDraft(format), allyBan, "hulk");
    expect(slotEffects(draft).banned.enemy.has("hulk")).toBe(true);
    expect(slotEffects(draft).banned.ally.has("hulk")).toBe(format === "mrc");
    draft = setDraftHero(draft, enemyBan, "hulk");
    expect(() => setDraftHero(draft, { ...allyBan, index: 0 }, "hulk")).toThrow(
      "Already selected",
    );
    expect(() =>
      setDraftHero(draft, { team: "ally", kind: "save", index: 1 }, "hulk"),
    ).toThrow("Already banned");
    draft = setDraftHero(draft, allyBan, "luna");
    expect(slotEffects(draft).banned.enemy.has("luna")).toBe(true);
    draft = setDraftHero(draft, enemyBan, null);
    expect(slotEffects(draft).banned.ally.has("hulk")).toBe(false);
    const saved = setDraftHero(
      draft,
      { team: "ally", kind: "save", index: 1 },
      "strange",
    );
    expect(() => setDraftHero(saved, enemyBan, "strange")).toThrow("Protected");
    const comp = { ...emptyComp(), name: "Direct", draft: saved };
    const entry = { id: "direct", updatedAt: "2026-09-29T12:00:00Z", comp };
    expect(parseCompLibraryStrict(serializeCompLibrary([entry]))).toEqual([
      entry,
    ]);
    for (const invalid of [
      {
        ...saved,
        teams: { ...saved.teams, ally: { ...saved.teams.ally, ban: [] } },
      },
      {
        ...saved,
        teams: {
          ...saved.teams,
          ally: { ...saved.teams.ally, save: ["strange", "strange"] },
        },
      },
      {
        ...saved,
        teams: {
          ...saved.teams,
          enemy: { ...saved.teams.enemy, save: ["luna", null] },
        },
      },
    ])
      expect(() =>
        parseCompLibraryStrict(
          JSON.stringify({
            version: 1,
            comps: [{ ...entry, comp: { ...comp, draft: invalid } }],
          }),
        ),
      ).toThrow();
  }
});

test("legacy partial drafts migrate by team, including reversed first team and saves after bans", () => {
  for (const firstTeam of ["ally", "enemy"] as const) {
    const legacy: DraftState = {
      format: "ignite",
      firstTeam,
      choices: ["strange", "hulk", "luna", "rocket", "magneto", "luna"],
    };
    const entry = {
      id: "legacy",
      updatedAt: "2026-09-29T12:00:00Z",
      comp: { ...emptyComp(), name: "Legacy", draft: legacy },
    };
    const migrated = parseCompLibraryStrict(
      JSON.stringify({ version: 1, comps: [entry] }),
    )[0]?.comp.draft;
    expect(migrated).toEqual(migrateLegacyDraft(legacy));
    expect(slotEffects(migrated ?? null)).toEqual(draftEffects(legacy));
    const partial = { ...legacy, choices: ["strange"] };
    const pending = migrateLegacyDraft(partial);
    expect(
      slotEffects(pending).banned[firstTeam === "ally" ? "enemy" : "ally"].has(
        "strange",
      ),
    ).toBe(true);
  }
});

function loadedDraft(draft: unknown) {
  const loaded = parseCompLibraryStrict(
    JSON.stringify({
      version: 1,
      comps: [
        {
          id: "legacy",
          updatedAt: "2026-10-15T12:00:00Z",
          comp: { ...emptyComp(), name: "Legacy", draft },
        },
      ],
    }),
  )[0]?.comp.draft;
  if (!loaded) throw new Error("Missing decoded draft.");
  return loaded;
}

const legacyMrcChoices = [
  "angela",
  "captain-america",
  "strange",
  "groot",
  "hulk",
  "magneto",
  "peni-parker",
  "rogue",
  "the-hood",
  "the-thing",
  "thor",
  "venom",
];

const allyFirstMrcTeams = {
  ally: {
    ban: ["angela", "hulk", "the-hood"],
    save: ["groot", "rogue"],
  },
  enemy: {
    ban: ["captain-america", "magneto", "the-thing"],
    save: ["strange", "peni-parker"],
  },
};

test("a stored MRC Ban 4 is dropped and earlier bans and saves stay", () => {
  expect(
    loadedDraft({
      format: "mrc",
      teams: {
        ally: {
          ban: ["hulk", "thor", "venom", "magneto"],
          save: ["luna", null],
        },
        enemy: {
          ban: [null, "groot", null, "rogue"],
          save: [null, "strange"],
        },
      },
    }),
  ).toEqual({
    format: "mrc",
    teams: {
      ally: { ban: ["hulk", "thor", "venom"], save: ["luna", null] },
      enemy: { ban: [null, "groot", null], save: [null, "strange"] },
    },
  });
});

test("an MRC ally ban list of length 4 and an enemy ban list of length 3 both load as length 3", () => {
  expect(
    loadedDraft({
      format: "mrc",
      teams: {
        ally: {
          ban: ["hulk", "thor", "venom", "magneto"],
          save: ["luna", null],
        },
        enemy: {
          ban: ["angela", "strange", "groot"],
          save: [null, "rocket"],
        },
      },
    }),
  ).toEqual({
    format: "mrc",
    teams: {
      ally: { ban: ["hulk", "thor", "venom"], save: ["luna", null] },
      enemy: { ban: ["angela", "strange", "groot"], save: [null, "rocket"] },
    },
  });
});

test("an unknown hero only in a retired MRC ban loads, and an unknown kept ban throws", () => {
  expect(
    loadedDraft({
      format: "mrc",
      teams: {
        ally: {
          ban: ["hulk", null, null, "not-a-hero"],
          save: ["luna", null],
        },
        enemy: {
          ban: [null, "groot", null, null],
          save: [null, "strange"],
        },
      },
    }),
  ).toEqual({
    format: "mrc",
    teams: {
      ally: { ban: ["hulk", null, null], save: ["luna", null] },
      enemy: { ban: [null, "groot", null], save: [null, "strange"] },
    },
  });
  expect(() =>
    loadedDraft({
      format: "mrc",
      teams: {
        ally: {
          ban: ["not-a-hero", "thor", "venom", "magneto"],
          save: [null, null],
        },
        enemy: { ban: [null, null, null], save: [null, null] },
      },
    }),
  ).toThrow("Unknown hero.");
});

test("a payload with teams and choices decodes the team slots", () => {
  expect(
    loadedDraft({
      format: "mrc",
      firstTeam: "enemy",
      choices: ["venom", "thor", "the-thing"],
      teams: {
        ally: {
          ban: ["hulk", "thor", "venom", "magneto"],
          save: ["luna", null],
        },
        enemy: {
          ban: [null, "groot", null, "rogue"],
          save: [null, "strange"],
        },
      },
    }),
  ).toEqual({
    format: "mrc",
    teams: {
      ally: { ban: ["hulk", "thor", "venom"], save: ["luna", null] },
      enemy: { ban: [null, "groot", null], save: [null, "strange"] },
    },
  });
});

test("legacy MRC choice lists drop the retired bans and keep the current order", () => {
  const allyFirst = {
    format: "mrc",
    teams: allyFirstMrcTeams,
  };
  expect(
    loadedDraft({
      format: "mrc",
      firstTeam: "ally",
      choices: legacyMrcChoices,
    }),
  ).toEqual(allyFirst);
  expect(
    loadedDraft({
      format: "mrc",
      firstTeam: "ally",
      choices: legacyMrcChoices.slice(0, 11),
    }),
  ).toEqual(allyFirst);
  expect(
    loadedDraft({
      format: "mrc",
      firstTeam: "ally",
      choices: legacyMrcChoices.slice(0, 10),
    }),
  ).toEqual(allyFirst);
  expect(
    loadedDraft({
      format: "mrc",
      firstTeam: "enemy",
      choices: legacyMrcChoices,
    }),
  ).toEqual({
    format: "mrc",
    teams: {
      ally: {
        ban: ["captain-america", "magneto", "the-thing"],
        save: ["strange", "peni-parker"],
      },
      enemy: {
        ban: ["angela", "hulk", "the-hood"],
        save: ["groot", "rogue"],
      },
    },
  });
  expect(
    loadedDraft({
      format: "mrc",
      firstTeam: "ally",
      choices: legacyMrcChoices.slice(0, 9),
    }),
  ).toEqual({
    format: "mrc",
    teams: {
      ally: {
        ban: ["angela", "hulk", "the-hood"],
        save: ["groot", "rogue"],
      },
      enemy: {
        ban: ["captain-america", "magneto", null],
        save: ["strange", "peni-parker"],
      },
    },
  });
  expect(
    loadedDraft({
      format: "mrc",
      firstTeam: "ally",
      choices: [...legacyMrcChoices.slice(0, 10), "not-a-hero", "also-missing"],
    }),
  ).toEqual(allyFirst);
});

test("draft slot and choice lengths outside the live order and one retired MRC ban are rejected", () => {
  expect(() =>
    loadedDraft({
      format: "mrc",
      teams: {
        ally: { ban: [null, null], save: [null, null] },
        enemy: { ban: [null, null], save: [null, null] },
      },
    }),
  ).toThrow("Invalid draft slot count.");
  expect(() =>
    loadedDraft({
      format: "mrc",
      teams: {
        ally: { ban: [null, null, null, null, null], save: [null, null] },
        enemy: { ban: [null, null, null, null, null], save: [null, null] },
      },
    }),
  ).toThrow("Invalid or oversized list in comp data.");
  expect(() =>
    loadedDraft({
      format: "mrc",
      teams: {
        ally: { ban: [null, null, null], save: [null] },
        enemy: { ban: [null, null, null], save: [null, null] },
      },
    }),
  ).toThrow("Invalid draft slot count.");
  expect(() =>
    loadedDraft({
      format: "ignite",
      teams: {
        ally: { ban: [null, null, null, null], save: [null, null] },
        enemy: { ban: [null, null, null, null], save: [null, null] },
      },
    }),
  ).toThrow("Invalid draft slot count.");
  expect(() =>
    loadedDraft({
      format: "ignite",
      teams: {
        ally: {
          ban: [null, null, null, null, null, null],
          save: [null, null],
        },
        enemy: {
          ban: [null, null, null, null, null, null],
          save: [null, null],
        },
      },
    }),
  ).toThrow("Invalid or oversized list in comp data.");
  expect(() =>
    loadedDraft({
      format: "mrc",
      firstTeam: "ally",
      choices: [...legacyMrcChoices, "wolverine"],
    }),
  ).toThrow("Invalid or oversized list in comp data.");
});

test("a full legacy Ignite choice list still migrates heroes past choice index 9", () => {
  expect(
    loadedDraft({
      format: "ignite",
      firstTeam: "ally",
      choices: [
        "strange",
        "hulk",
        "luna",
        "rocket",
        "magneto",
        "thor",
        "venom",
        "groot",
        "peni-parker",
        "rogue",
        "captain-america",
        "angela",
        "the-hood",
        "the-thing",
      ],
    }),
  ).toEqual({
    format: "ignite",
    teams: {
      ally: {
        ban: ["strange", "thor", "venom", "rogue", "the-hood"],
        save: ["luna", "captain-america"],
      },
      enemy: {
        ban: ["hulk", "rocket", "groot", "angela", "the-thing"],
        save: ["magneto", "peni-parker"],
      },
    },
  });
});

test("a normalized MRC draft parses the same way a second time", () => {
  const source = JSON.stringify({
    version: 1,
    comps: [
      {
        id: "legacy",
        updatedAt: "2026-10-15T12:00:00Z",
        comp: {
          ...emptyComp(),
          name: "Legacy",
          draft: {
            format: "mrc",
            teams: {
              ally: {
                ban: ["hulk", "thor", "venom", "magneto"],
                save: ["luna", null],
              },
              enemy: {
                ban: [null, "groot", null, "rogue"],
                save: [null, "strange"],
              },
            },
          },
        },
      },
    ],
  });
  const first = parseCompLibraryStrict(source);
  const second = parseCompLibraryStrict(serializeCompLibrary(first));
  expect(first[0]?.comp.draft).toEqual({
    format: "mrc",
    teams: {
      ally: { ban: ["hulk", "thor", "venom"], save: ["luna", null] },
      enemy: { ban: [null, "groot", null], save: [null, "strange"] },
    },
  });
  expect(second).toEqual(first);
});

test("duplicate saved IDs stay unavailable for recovery", () => {
  const saved = {
    id: "reserved",
    updatedAt: "2026-09-30T12:00:00Z",
    comp: { ...emptyComp(), name: "Valid" },
  };
  const unavailable = {
    ...saved,
    comp: { ...saved.comp, mapIds: ["retired-map"] },
  };
  const duplicate = decodeCompLibrary(
    JSON.stringify({ version: 1, comps: [saved, unavailable] }),
  );
  expect(duplicate.entries).toEqual([]);
  expect(duplicate.unavailable).toEqual([saved, unavailable]);
});
