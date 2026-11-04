import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { readImportFile, type ImportPlan } from "../src/backup";
import type { BoardDrawing, MeasureBoardNote } from "../src/boardDrawings";
import { resolveBoardMap } from "../src/boardMaps";
import { BoardSession } from "../src/boardSession";
import { decodeCompLibrary, updateLibrarySource } from "../src/compLibrary";
import { findBoardMap } from "../src/maps";
import { emptyOpenComp } from "../src/savedComps";
import {
  EMPTY_STORED_RECORDS,
  decodeBoardRecord,
  decodeStoredRecords,
  encodeBoardRecord,
} from "../src/workspaceRecord";

const TEAM_NOTICE =
  "Saved board limited to the first 6 heroes per team. Extra placements were removed.";
const NEWER =
  "This data was saved by a newer version of Rivals Lab. Reload the page to update.";

async function fixture(name: string): Promise<string> {
  return readFile(
    new URL(`./fixtures/stored/${name}`, import.meta.url),
    "utf8",
  );
}

async function restore(board: unknown): Promise<ImportPlan> {
  const text = JSON.stringify({
    format: "rivals-lab-backup",
    version: 1,
    exportedAt: "2026-10-12T12:00:00.000Z",
    library: { version: 1, comps: [] },
    board,
    customMaps: [],
    openComp: emptyOpenComp(),
  });
  return readImportFile(
    { size: text.length, text: () => Promise.resolve(text) },
    () => Promise.resolve(decodeStoredRecords(EMPTY_STORED_RECORDS, "boot")),
  );
}

test("a library saved before #30 keeps its valid comps and its obsolete entry", async () => {
  const source = await fixture("comp-library-pre-30.json");
  const { library } = decodeStoredRecords(
    { ...EMPTY_STORED_RECORDS, library: source },
    "boot",
  );
  expect(
    library.entries.map(({ id, comp }) => ({
      id,
      mapIds: comp.mapIds,
      draft: comp.draft?.format ?? null,
    })),
  ).toEqual([
    { id: "krakoa-brawl", mapIds: ["krakoa"], draft: null },
    { id: "ignite-draft", mapIds: [], draft: "ignite" },
  ]);
  expect(library.errors).toEqual(["Unknown hero: retired-hero."]);
  const stored: unknown = JSON.parse(source);
  expect(stored).toMatchObject({ comps: [{}, {}, library.unavailable[0]] });
});

test("a board saved before #98 boots and restores to the same six heroes per team", async () => {
  const stored: unknown = JSON.parse(
    await fixture("board-pre-98-over-six.json"),
  );
  const booted = decodeStoredRecords(
    { ...EMPTY_STORED_RECORDS, board: stored },
    "boot",
  );
  const plan = await restore(stored);
  const payload = plan.take();
  if (payload.kind !== "restore") throw new Error("Expected a restore plan.");
  const keptIds = [
    "ally-angela",
    "enemy-angela",
    "ally-captain-america",
    "enemy-captain-america",
    "ally-devil-dinosaur",
    "enemy-devil-dinosaur",
    "ally-strange",
    "enemy-strange",
    "ally-emma-frost",
    "enemy-emma-frost",
    "ally-groot",
    "enemy-groot",
  ];
  expect(booted.workspace.board.tokens.map((token) => token.id)).toEqual(
    keptIds,
  );
  expect(booted.workspace.board.map).toEqual({
    kind: "builtin",
    id: "hells-heaven-airfield-base",
  });
  expect(booted.boardNotices).toEqual([TEAM_NOTICE]);
  expect(plan.preview).toMatchObject({
    kind: "restore",
    boardNotices: [TEAM_NOTICE],
    file: { heroes: 12 },
  });
  expect(payload.board).toEqual(
    encodeBoardRecord(booted.workspace.board, booted.workspace.iconSize),
  );
  expect(payload.board.version).toBe(2);
});

test("a board saved before #96 opens the first stage with every token and drawing on its map", async () => {
  const stored: unknown = JSON.parse(
    await fixture("board-pre-96-landscape.json"),
  );
  const { workspace } = decodeStoredRecords(
    { ...EMPTY_STORED_RECORDS, board: stored },
    "boot",
  );
  expect(workspace.board.map).toEqual({
    kind: "builtin",
    id: "birnin-tchalla-imperial-institute-of-science",
  });
  expect(Object.keys(workspace.board.drawingsByMap).sort()).toEqual([
    "birnin-tchalla-imperial-institute-of-science",
    "hells-heaven-airfield-base",
  ]);
  const noteHeight = 36;
  const measureNote: MeasureBoardNote = (text, width) => {
    void text;
    return { width, height: noteHeight };
  };
  const { board, tokens } = new BoardSession(
    measureNote,
    workspace.board,
    workspace.iconSize,
  ).getSnapshot();
  const map = resolveBoardMap(board.map);
  expect(tokens).toHaveLength(2);
  const offMap = tokens.filter(
    (token) =>
      token.x < 0 || token.x > map.width || token.y < 0 || token.y > map.height,
  );
  expect(offMap).toEqual([]);
  const extent = (drawing: BoardDrawing): { width: number; height: number } =>
    drawing.kind === "zone"
      ? drawing
      : drawing.kind === "note"
        ? { width: drawing.width, height: noteHeight }
        : { width: drawing.dx, height: drawing.dy };
  for (const [id, drawings] of Object.entries(board.drawingsByMap)) {
    const owner = findBoardMap(id);
    if (!owner) throw new Error(`Unknown map: ${id}`);
    const bounds = resolveBoardMap({ kind: "builtin", id: owner.stage.id });
    expect(drawings).toHaveLength(2);
    for (const drawing of drawings ?? []) {
      const size = extent(drawing);
      expect(drawing.x, `${id} ${drawing.id}`).toBeGreaterThanOrEqual(0);
      expect(drawing.y, `${id} ${drawing.id}`).toBeGreaterThanOrEqual(0);
      expect(drawing.x + size.width, `${id} ${drawing.id}`).toBeLessThanOrEqual(
        bounds.width,
      );
      expect(
        drawing.y + size.height,
        `${id} ${drawing.id}`,
      ).toBeLessThanOrEqual(bounds.height);
    }
  }
});

test("a board saved by this version decodes without a notice", async () => {
  const stored: unknown = JSON.parse(
    await fixture("board-pre-98-over-six.json"),
  );
  const { board, iconSize } = decodeBoardRecord(stored, []);
  expect(decodeBoardRecord(encodeBoardRecord(board, iconSize), [])).toEqual({
    board,
    iconSize,
    notices: [],
  });
});

test("records from a newer version are refused, not replaced", async () => {
  const board = encodeBoardRecord(
    decodeStoredRecords(EMPTY_STORED_RECORDS, "boot").workspace.board,
    100,
  );
  const newerBoard = { ...board, version: 3 };
  expect(() => decodeBoardRecord(newerBoard, [])).toThrow(NEWER);
  await expect(restore(newerBoard)).rejects.toThrow(NEWER);
  const booted = decodeStoredRecords(
    { ...EMPTY_STORED_RECORDS, board: newerBoard },
    "boot",
  );
  expect(booted.boardNotices).toEqual([]);
  const newerLibrary = JSON.stringify({ version: 2, comps: [] });
  expect(() => decodeCompLibrary(newerLibrary)).toThrow(NEWER);
  expect(() => updateLibrarySource(newerLibrary, (library) => library)).toThrow(
    NEWER,
  );
});
