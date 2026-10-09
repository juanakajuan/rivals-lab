import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type {} from "./fixtures/appData.ts";
import {
  decodeCompLibrary,
  emptyComp,
  serializeCompLibrary,
} from "../src/comps";

async function openHarness(page: Page): Promise<void> {
  await page.goto("/tests/fixtures/appData.html");
  await page.waitForFunction(() => "appDataHarness" in window);
}

test("a board token and a custom map drawing survive a reload", async ({
  page,
}) => {
  await openHarness(page);
  const mapId = await page.evaluate(async () => {
    const harness = window.appDataHarness;
    const data = await harness.openAppData();
    const map = await harness.createMap("scrim-map.png", 800, 400);
    data.autosave.sync({
      ...data.workspace,
      iconSize: 120,
      customMaps: [map],
      board: {
        map,
        maps: [map],
        mode: null,
        positionsByMap: {},
        tokens: [
          { id: "ally-thor", heroId: "thor", team: "ally", x: 300, y: 250 },
        ],
        drawingsByMap: {
          [map.id]: [
            {
              id: "note-1",
              kind: "note",
              color: "#ffd166",
              x: 40,
              y: 50,
              text: "Hold high ground",
              width: 180,
            },
          ],
        },
      },
    });
    await data.autosave.flush();
    return map.id;
  });

  await page.reload();
  await page.waitForFunction(() => "appDataHarness" in window);
  const restored = await page.evaluate(async () => {
    const { workspace } = await window.appDataHarness.openAppData();
    return {
      mapId: workspace.board.map.id,
      tokens: workspace.board.tokens,
      drawingsByMap: workspace.board.drawingsByMap,
      iconSize: workspace.iconSize,
      customMaps: workspace.customMaps.map((map) => ({
        id: map.id,
        name: map.name,
        width: map.width,
        height: map.height,
        sourcePixels: map.sourcePixels,
        image: map.imagePath.slice(0, 22),
      })),
    };
  });
  expect(restored).toEqual({
    mapId,
    tokens: [{ id: "ally-thor", heroId: "thor", team: "ally", x: 300, y: 250 }],
    drawingsByMap: {
      [mapId]: [
        {
          id: "note-1",
          kind: "note",
          color: "#ffd166",
          x: 40,
          y: 50,
          text: "Hold high ground",
          width: 180,
        },
      ],
    },
    iconSize: 120,
    customMaps: [
      {
        id: mapId,
        name: "scrim-map.png",
        width: 1200,
        height: 600,
        sourcePixels: 320_000,
        image: "data:image/png;base64,",
      },
    ],
  });
});

test("boot keeps the parts that decode and starts fresh for the rest", async ({
  page,
}) => {
  await openHarness(page);
  const library = serializeCompLibrary([
    {
      id: "dive",
      updatedAt: "2026-10-01T12:00:00.000Z",
      comp: { ...emptyComp(), name: "Dive" },
    },
  ]);
  const openComp = {
    comp: { ...emptyComp(), name: "Dive", notes: "Unsaved idea" },
    baseline: { ...emptyComp(), name: "Dive" },
    saved: { id: "dive", baseline: { ...emptyComp(), name: "Dive" } },
  };
  const booted = await page.evaluate(
    async ({ library, openComp }) => {
      const harness = window.appDataHarness;
      await harness.openAppData();
      await harness.storeRecord(
        "comp-libraries",
        "rivals-lab.comps.v1",
        library,
      );
      await harness.storeRecord("workspace", "openComp", openComp);
      await harness.storeRecord("workspace", "board", {
        mapId: "custom:00000000-0000-4000-8000-000000000000",
        tokens: [],
        drawingsByMap: {},
        iconSize: 120,
      });
      const { workspace, compStart } = await harness.openAppData();
      return {
        mapId: workspace.board.map.id,
        tokens: workspace.board.tokens.length,
        iconSize: workspace.iconSize,
        openComp: workspace.openComp,
        savedComps: compStart.library.entries.map((entry) => entry.comp.name),
      };
    },
    { library, openComp },
  );
  expect(booted).toEqual({
    mapId: "birnin-tchalla-domination",
    tokens: 6,
    iconSize: 100,
    openComp,
    savedComps: ["Dive"],
  });
});

test("writes from a replaced data generation change nothing", async ({
  page,
}) => {
  await openHarness(page);
  const saved = {
    id: "dive",
    updatedAt: "2026-10-01T12:00:00.000Z",
    comp: { ...emptyComp(), name: "Dive" },
  };
  const result = await page.evaluate(async (saved) => {
    const harness = window.appDataHarness;
    const data = await harness.openAppData();
    const statuses: string[] = [];
    data.autosave.subscribe((status) => statuses.push(status.kind));
    await harness.storeRecord("workspace", "epoch", "another-tab");
    const copy = await harness.prependCompCopies(data.comps, [saved]).then(
      () => "written",
      (error: unknown) =>
        error instanceof Error ? error.message : String(error),
    );
    data.autosave.sync({
      ...data.workspace,
      board: {
        map: { kind: "builtin", id: "hells-heaven-domination" },
        maps: [{ kind: "builtin", id: "hells-heaven-domination" }],
        mode: null,
        positionsByMap: {},
        tokens: [],
        drawingsByMap: {},
      },
      iconSize: 100,
    });
    await data.autosave.flush();
    return {
      copy,
      statuses,
      library: await harness.storedRecord(
        "comp-libraries",
        "rivals-lab.comps.v1",
      ),
      board: await harness.storedRecord("workspace", "board"),
    };
  }, saved);
  expect(result).toEqual({
    copy: "This browser's data was replaced in another tab. Reload to continue.",
    statuses: ["idle", "replacedElsewhere"],
    library: null,
    board: undefined,
  });
});

const dive = {
  id: "dive",
  updatedAt: "2026-10-01T12:00:00.000Z",
  comp: { ...emptyComp(), name: "Dive", notes: "Engage on the left" },
};
const poke = {
  id: "poke",
  updatedAt: "2026-10-02T12:00:00.000Z",
  comp: { ...emptyComp(), name: "Poke" },
};
const storedLibrary = JSON.stringify(
  { version: 1, owner: "scrims", comps: [dive, poke, { id: "broken" }] },
  null,
  2,
);
const openComp = {
  comp: { ...dive.comp, notes: "Engage on the right" },
  baseline: dive.comp,
  saved: { id: "dive", baseline: dive.comp },
};

async function seedWorkspace(page: Page): Promise<number> {
  return page.evaluate(
    async ({ storedLibrary, openComp }) => {
      const harness = window.appDataHarness;
      const data = await harness.openAppData();
      await harness.storeRecord(
        "comp-libraries",
        "rivals-lab.comps.v1",
        storedLibrary,
      );
      const first = await harness.createMap("scrim-map.png", 800, 400);
      const second = await harness.createMap("tower.png", 300, 600);
      data.autosave.sync({
        openComp,
        iconSize: 130,
        customMaps: [first, second],
        board: {
          map: second,
          maps: [second],
          mode: null,
          positionsByMap: {},
          tokens: [
            { id: "ally-thor", heroId: "thor", team: "ally", x: 120, y: 80 },
            {
              id: "enemy-deadpool",
              heroId: "deadpool",
              team: "enemy",
              deadpoolRole: "Strategist",
              x: 200,
              y: 300,
            },
          ],
          drawingsByMap: {
            [first.id]: [
              {
                id: "note-1",
                kind: "note",
                color: "#ffd166",
                x: 40,
                y: 50,
                text: "Hold high ground",
                width: 180,
              },
              {
                id: "arrow-1",
                kind: "arrow",
                color: "#ef476f",
                x: 300,
                y: 200,
                dx: -80,
                dy: 40,
              },
            ],
            "hells-heaven-domination": [
              {
                id: "zone-1",
                kind: "zone",
                color: "#06d6a0",
                x: 10,
                y: 20,
                width: 120,
                height: 90,
              },
            ],
            [second.id]: [],
          },
        },
      });
      await data.autosave.flush();
      return first.sourceBytes + second.sourceBytes;
    },
    { storedLibrary, openComp },
  );
}

async function downloadBackup(page: Page): Promise<string> {
  const download = page.waitForEvent("download");
  await page.evaluate(() => window.appDataHarness.exportBackup());
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^rivals-lab-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const path = await file.path();
  return readFile(path, "utf8");
}

async function applyRestore(page: Page): Promise<void> {
  await Promise.all([
    page.waitForEvent("load"),
    page.evaluate(() => void window.appDataHarness.applyImport()),
  ]);
  await page.waitForFunction(() => "appDataHarness" in window);
}

function storedRecords(page: Page): Promise<Readonly<Record<string, unknown>>> {
  return page.evaluate(() => window.appDataHarness.storedRecords());
}

test("a full backup restores every record in a fresh browser", async ({
  page,
  browser,
}) => {
  await openHarness(page);
  const customMapBytes = await seedWorkspace(page);
  const original = await storedRecords(page);
  const backup = await downloadBackup(page);

  const fresh = await browser.newContext();
  const target = await fresh.newPage();
  await openHarness(target);
  await target.evaluate(() => window.appDataHarness.openAppData());
  const preview = await target.evaluate(
    (backup) => window.appDataHarness.readImport(backup),
    backup,
  );
  expect(preview).toEqual({
    kind: "restore",
    exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    file: {
      savedComps: 2,
      unavailableComps: 1,
      openComp: { name: "Dive", unsaved: true, link: "saved" },
      boardMapName: "tower.png",
      heroes: 2,
      drawings: 3,
      mapsWithDrawings: 2,
      customMaps: 2,
      customMapBytes,
      iconSize: 130,
    },
    current: {
      savedComps: 0,
      unavailableComps: 0,
      openComp: null,
      boardMapName: "Intergalactic Empire of Wakanda: Birnin T'Challa",
      heroes: 6,
      drawings: 0,
      mapsWithDrawings: 0,
      customMaps: 0,
      customMapBytes: 0,
      iconSize: 100,
    },
  });
  expect(await storedRecords(target)).toEqual({
    library: null,
    board: undefined,
    openComp: undefined,
    customMaps: [],
  });

  await applyRestore(target);
  expect(await storedRecords(target)).toEqual(original);
  const booted = await target.evaluate(async () => {
    const { workspace, compStart } = await window.appDataHarness.openAppData();
    return {
      mapName:
        workspace.board.map.kind === "custom" ? workspace.board.map.name : null,
      tokens: workspace.board.tokens.map((token) => token.id),
      drawingMaps: Object.keys(workspace.board.drawingsByMap).length,
      iconSize: workspace.iconSize,
      customMaps: workspace.customMaps.map((map) => map.name),
      openComp: workspace.openComp,
      comps: compStart.library.entries.map((entry) => entry.comp.name),
    };
  });
  expect(booted).toEqual({
    mapName: "tower.png",
    tokens: ["ally-thor", "enemy-deadpool"],
    drawingMaps: 3,
    iconSize: 130,
    customMaps: expect.arrayContaining(["scrim-map.png", "tower.png"]),
    openComp,
    comps: ["Dive", "Poke"],
  });

  await target.evaluate(
    (backup) => window.appDataHarness.readImport(backup),
    backup,
  );
  await applyRestore(target);
  expect(await storedRecords(target)).toEqual(original);
  await fresh.close();
});

test("a comps file previews copies and leaves the board alone", async ({
  page,
}) => {
  await openHarness(page);
  await seedWorkspace(page);
  const before = await storedRecords(page);
  const preview = await page.evaluate(
    (file) => window.appDataHarness.readImport(file),
    serializeCompLibrary([poke]),
  );
  expect(preview).toEqual({ kind: "addComps", count: 1, names: ["Poke"] });
  expect(
    await page.evaluate(() => window.appDataHarness.applyImport()),
  ).toEqual({ kind: "added", count: 1 });
  await expect(
    page.evaluate(() => window.appDataHarness.applyImport()),
  ).rejects.toThrow("This import was already applied.");
  const after = await storedRecords(page);
  expect({ ...after, library: null }).toEqual({ ...before, library: null });
  const library = decodeCompLibrary(String(after.library));
  expect(library.envelope["owner"]).toBe("scrims");
  expect(library.unavailable).toEqual([{ id: "broken" }]);
  expect(library.entries.map((entry) => entry.comp.name)).toEqual([
    "Poke",
    "Dive",
    "Poke",
  ]);
  expect(library.entries[0]?.id).not.toBe("poke");
});

test("a rejected file explains why and writes nothing", async ({ page }) => {
  await openHarness(page);
  await seedWorkspace(page);
  const backup = await downloadBackup(page);
  const before = await storedRecords(page);
  const zones = Array.from({ length: 2001 }, (_, index) =>
    JSON.stringify({
      id: `zone-${index}`,
      kind: "zone",
      color: "#06d6a0",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    }),
  ).join(",");
  const crowded = backup.replace(
    '"hells-heaven-domination":[',
    `"hells-heaven-domination":[${zones},`,
  );
  const resized = backup.replace(
    /"sourceBytes":(\d+)/,
    (_, bytes: string) => `"sourceBytes":${Number(bytes) + 1}`,
  );
  const cases: readonly (readonly [string, string, number?])[] = [
    ["{", "This file is damaged or is not JSON."],
    [
      backup.replace('"version":1', '"version":2'),
      "This backup was made by a newer version of Rivals Lab. Update and try again.",
    ],
    [
      "{}",
      "This backup is larger than 80 MiB. A Rivals Lab backup holds up to 50 MiB of map images and 2 MB of saved comps.",
      80 * 1024 * 1024 + 1,
    ],
    [
      JSON.stringify({ hello: "world" }),
      "This file is not a Rivals Lab backup or comps file.",
    ],
    [
      serializeCompLibrary([
        { ...poke, comp: { ...poke.comp, notes: "é".repeat(5_000) } },
      ]).padEnd(2_000_001, " "),
      "The file must be smaller than 2 MB.",
    ],
    [
      JSON.stringify({
        version: 1,
        comps: [
          dive,
          { ...poke, comp: { ...poke.comp, mapIds: ["retired-map"] } },
        ],
      }),
      "Unknown map: retired-map.",
    ],
    [crowded, "A map can hold at most 2,000 drawings."],
    [resized, "cannot be read."],
  ];
  for (const [file, message, size] of cases)
    await expect(
      page.evaluate(
        ({ file, size }) => window.appDataHarness.readImport(file, size),
        { file, size },
      ),
    ).rejects.toThrow(message);
  expect(await storedRecords(page)).toEqual(before);
});

test("several maps with per-map positions and a game mode survive a reload", async ({
  page,
}) => {
  await openHarness(page);
  const wakanda = { kind: "builtin", id: "birnin-tchalla-domination" } as const;
  const hydra = { kind: "builtin", id: "hells-heaven-domination" } as const;
  const tokens = [
    { id: "ally-thor", heroId: "thor", team: "ally", x: 300, y: 250 },
  ] as const;
  await page.evaluate(
    async ({ wakanda, hydra, tokens }) => {
      const data = await window.appDataHarness.openAppData();
      data.autosave.sync({
        ...data.workspace,
        board: {
          map: wakanda,
          maps: [wakanda, hydra],
          mode: null,
          tokens: [...tokens],
          positionsByMap: { [hydra.id]: { "ally-thor": { x: 100, y: 120 } } },
          drawingsByMap: {},
        },
      });
      await data.autosave.flush();
    },
    { wakanda, hydra, tokens },
  );
  await page.reload();
  await page.waitForFunction(() => "appDataHarness" in window);
  const multi = await page.evaluate(async () => {
    const { workspace } = await window.appDataHarness.openAppData();
    const { board } = workspace;
    return {
      maps: board.maps.map((map) => map.id),
      mode: board.mode,
      positions: board.positionsByMap,
    };
  });
  expect(multi).toEqual({
    maps: [wakanda.id, hydra.id],
    mode: null,
    positions: { [hydra.id]: { "ally-thor": { x: 100, y: 120 } } },
  });
  await page.evaluate(
    async ({ wakanda, tokens }) => {
      const data = await window.appDataHarness.openAppData();
      data.autosave.sync({
        ...data.workspace,
        board: {
          map: wakanda,
          maps: [],
          mode: "Convoy",
          tokens: [...tokens],
          positionsByMap: {},
          drawingsByMap: {},
        },
      });
      await data.autosave.flush();
    },
    { wakanda, tokens },
  );
  await page.reload();
  await page.waitForFunction(() => "appDataHarness" in window);
  const mode = await page.evaluate(async () => {
    const { board } = (await window.appDataHarness.openAppData()).workspace;
    return { maps: board.maps.length, mode: board.mode, map: board.map.id };
  });
  expect(mode).toEqual({ maps: 0, mode: "Convoy", map: wakanda.id });
});
