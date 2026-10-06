import { expect, test, type Page } from "@playwright/test";
import type {} from "./fixtures/appData.ts";
import { emptyComp, serializeCompLibrary } from "../src/comps";

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
    data.autosave.customMap(map);
    data.autosave.board(
      {
        map,
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
            },
          ],
        },
      },
      120,
    );
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
    data.autosave.board(
      {
        map: { kind: "builtin", id: "hells-heaven-domination" },
        tokens: [],
        drawingsByMap: {},
      },
      100,
    );
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
