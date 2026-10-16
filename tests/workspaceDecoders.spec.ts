import { expect, test } from "@playwright/test";
import { decodeDrawing } from "../src/boardDrawings";
import { customMapBudgetError, decodeCustomMap } from "../src/boardMaps";
import { decodeToken, parseIconSize } from "../src/boardTokens";
import { decodeOpenComp, emptyComp, type SavedComp } from "../src/comps";
import {
  StoredLibrarySource,
  decodeCompLibrary,
  parseCompLibraryStrict,
  serializeCompLibrary,
  withCompCopies,
} from "../src/compLibrary";
import { readImportFile, type StoredState } from "../src/backup";
import { decodeBoardRecord, decodeStoredRecords } from "../src/workspaceRecord";

const MAP_ID = "custom:0b4c5f7e-8c1d-4f2a-9e3b-6a7d8c9e0f12";

function saved(id: string, name: string): SavedComp {
  return {
    id,
    updatedAt: "2026-10-01T12:00:00.000Z",
    comp: { ...emptyComp(), name },
  };
}

test("icon sizes accept only the slider steps", () => {
  expect(parseIconSize(120)).toBe(120);
  expect(() => parseIconSize(125)).toThrow("Invalid hero icon size.");
  expect(() => parseIconSize("120")).toThrow("Invalid hero icon size.");
});

test("tokens keep known heroes with matching IDs and roles", () => {
  expect(
    decodeToken({
      id: "enemy-deadpool",
      heroId: "deadpool",
      team: "enemy",
      deadpoolRole: "Duelist",
      x: 410.5,
      y: 220,
      extra: true,
    }),
  ).toEqual({
    id: "enemy-deadpool",
    heroId: "deadpool",
    team: "enemy",
    deadpoolRole: "Duelist",
    x: 410.5,
    y: 220,
  });
  expect(() =>
    decodeToken({ id: "ally-hulk", heroId: "thor", team: "ally", x: 1, y: 1 }),
  ).toThrow("Invalid hero token ID.");
  expect(() =>
    decodeToken({
      id: "ally-thor",
      heroId: "thor",
      team: "ally",
      deadpoolRole: "Duelist",
      x: 1,
      y: 1,
    }),
  ).toThrow("Invalid Deadpool role.");
  expect(() =>
    decodeToken({
      id: "ally-nobody",
      heroId: "nobody",
      team: "ally",
      x: 1,
      y: 1,
    }),
  ).toThrow("Unknown hero: nobody.");
  expect(() =>
    decodeToken({
      id: "ally-thor",
      heroId: "thor",
      team: "ally",
      x: 1,
      y: NaN,
    }),
  ).toThrow("Invalid hero position.");
});

test("drawings decode each kind and cap note text at the editor limit", () => {
  expect(
    decodeDrawing({
      id: "a1",
      kind: "arrow",
      color: "#FFD166",
      x: 10,
      y: 20,
      dx: -30,
      dy: 40,
      width: 99,
    }),
  ).toEqual({
    id: "a1",
    kind: "arrow",
    color: "#FFD166",
    x: 10,
    y: 20,
    dx: -30,
    dy: 40,
  });
  expect(
    decodeDrawing({
      id: "n1",
      kind: "note",
      color: "#ffffff",
      x: 0,
      y: 0,
      text: "x".repeat(200),
    }),
  ).toEqual({
    id: "n1",
    kind: "note",
    color: "#ffffff",
    x: 0,
    y: 0,
    text: "x".repeat(200),
    width: 180,
  });
  expect(() =>
    decodeDrawing({
      id: "n2",
      kind: "note",
      color: "#ffffff",
      x: 0,
      y: 0,
      text: "x".repeat(201),
    }),
  ).toThrow("Each note needs text of at most 200 characters.");
  expect(() =>
    decodeDrawing({
      id: "z1",
      kind: "zone",
      color: "#ffffff",
      x: 0,
      y: 0,
      width: -1,
      height: 5,
    }),
  ).toThrow("Invalid drawing position or size.");
  expect(() =>
    decodeDrawing({ id: "c1", kind: "circle", color: "#ffffff", x: 0, y: 0 }),
  ).toThrow("Unknown drawing kind.");
  expect(() =>
    decodeDrawing({ id: "p1", kind: "toString", color: "#fff", x: 0, y: 0 }),
  ).toThrow("Unknown drawing kind.");
});

test("custom maps keep an image data URL and its recorded size", () => {
  const map = {
    kind: "custom",
    id: MAP_ID,
    name: "scrim-map.png",
    mode: "Custom image",
    imagePath: "data:image/png;base64,iVBORw0KGgo=",
    width: 1200,
    height: 600,
    sourceBytes: 8,
    sourcePixels: 800,
  };
  expect(decodeCustomMap(map)).toEqual(map);
  expect(() => decodeCustomMap({ ...map, id: "custom:../x" })).toThrow(
    "Invalid custom map ID.",
  );
  expect(() =>
    decodeCustomMap({ ...map, imagePath: "https://example.com/map.png" }),
  ).toThrow("The image for scrim-map.png is not a supported image.");
});

test("the custom map budget is shared by uploads and imports", () => {
  const mebibyte = 1024 * 1024;
  expect(
    customMapBudgetError([
      { sourceBytes: 40 * mebibyte, sourcePixels: 1 },
      { sourceBytes: 10 * mebibyte, sourcePixels: 1 },
    ]),
  ).toBeNull();
  expect(
    customMapBudgetError([
      { sourceBytes: 40 * mebibyte, sourcePixels: 1 },
      { sourceBytes: 10 * mebibyte + 1, sourcePixels: 1 },
    ]),
  ).toBe(
    "Custom maps have a 50 MiB total image limit. This browser has reached its custom map limit.",
  );
  expect(
    customMapBudgetError([
      { sourceBytes: 1, sourcePixels: 60_000_000 },
      { sourceBytes: 1, sourcePixels: 20_000_001 },
    ]),
  ).toBe(
    "Custom maps have an 80 million pixel total image limit. This browser has reached its custom map limit.",
  );
});

test("the open comp may be unnamed while saved comps still need names", () => {
  const unnamed = { ...emptyComp(), name: "  Dive " };
  expect(decodeOpenComp(unnamed).name).toBe("  Dive ");
  expect(decodeOpenComp(emptyComp())).toEqual(emptyComp());
  expect(() =>
    parseCompLibraryStrict(serializeCompLibrary([saved("blank", "")])),
  ).toThrow("Each saved comp needs a name.");
});

test("library records keep extra keys and unavailable entries", () => {
  const library = decodeCompLibrary(
    JSON.stringify({
      version: 1,
      owner: "scrims",
      comps: [saved("dive", "Dive"), { id: "broken" }],
    }),
  );
  expect(JSON.parse(StoredLibrarySource.encode(library).text)).toEqual({
    version: 1,
    owner: "scrims",
    comps: [saved("dive", "Dive"), { id: "broken" }],
  });
  expect(() =>
    StoredLibrarySource.encode({
      ...library,
      entries: [saved("broken", "Collides")],
    }),
  ).toThrow("A comp ID belongs to an unavailable entry.");
  expect(() =>
    StoredLibrarySource.encode({
      ...library,
      entries: Array.from({ length: 500 }, (_, index) =>
        saved(`comp-${index}`, `Comp ${index}`),
      ),
    }),
  ).toThrow("The library limit is 500 comps.");
});

test("copies are prepended with new IDs and existing comps stay", () => {
  const { entries } = withCompCopies(
    decodeCompLibrary(serializeCompLibrary([saved("dive", "Dive")])),
    [saved("dive", "Dive"), saved("poke", "Poke")],
  );
  expect(entries.map((entry) => entry.comp.name)).toEqual([
    "Dive",
    "Poke",
    "Dive",
  ]);
  expect(entries[2]?.id).toBe("dive");
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(3);
  expect(entries[0]?.updatedAt).not.toBe("2026-10-01T12:00:00.000Z");
});

const HEROES = [
  "angela",
  "captain-america",
  "devil-dinosaur",
  "strange",
  "emma-frost",
  "groot",
  "hulk",
] as const;

function boardRecord(allies: number): Record<string, unknown> {
  return {
    mapId: "birnin-tchalla",
    tokens: HEROES.slice(0, allies).map((heroId, index) => ({
      id: `ally-${heroId}`,
      heroId,
      team: "ally",
      x: index,
      y: index,
    })),
    drawingsByMap: {},
    iconSize: 120,
  };
}

test("board records keep the first six heroes per team in every mode", () => {
  const legacy = decodeBoardRecord(boardRecord(7), []);
  expect(legacy.board.tokens.map((token) => token.heroId)).toEqual(
    HEROES.slice(0, 6),
  );
  expect(legacy.notices).toEqual([
    "Saved board limited to the first 6 heroes per team. Extra placements were removed.",
  ]);
  expect(() =>
    decodeBoardRecord({ ...boardRecord(7), version: 2 }, []),
  ).toThrow("Position Board teams cannot exceed 6 heroes.");
  expect(decodeBoardRecord(boardRecord(6), [])).toMatchObject({
    iconSize: 120,
    notices: [],
  });
});

test("damaged stored records fall back to empty state one by one", () => {
  const { workspace, library } = decodeStoredRecords(
    {
      library: "not json",
      board: boardRecord(7),
      openComp: { broken: true },
      customMaps: [{ id: "custom:bad" }],
    },
    "boot",
  );
  expect(workspace.board.tokens).toHaveLength(6);
  expect(workspace.iconSize).toBe(120);
  expect(workspace.customMaps).toEqual([]);
  expect(workspace.openComp.comp.name).toBe("");
  expect(library.entries).toEqual([]);
});

test("an import plan applies its comps only once", async () => {
  const text = serializeCompLibrary([saved("c1", "Dive")]);
  const plan = await readImportFile(
    { size: text.length, text: () => Promise.resolve(text) },
    () => Promise.reject<StoredState>(new Error("not needed")),
  );
  expect(plan.preview).toEqual({ kind: "addComps", count: 1, names: ["Dive"] });
  expect(plan.take().kind).toBe("addComps");
  expect(() => plan.take()).toThrow("This import was already applied.");
});
