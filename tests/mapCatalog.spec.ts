import { access, readFile, readdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { MAPS, findMap } from "../src/maps";
import { decodeStoredRecords } from "../src/workspaceRecord";

const STATIC = new URL("../static/", import.meta.url);

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

async function idSnapshot(): Promise<readonly string[]> {
  const ids = await readJson("./fixtures/mapIds.json");
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string"))
    throw new Error("tests/fixtures/mapIds.json must list map ID strings.");
  return ids;
}

function catalogImages(): readonly string[] {
  return MAPS.flatMap((map) => [
    ...("board" in map ? [map.board.imagePath] : []),
    ...("preview" in map ? [map.preview.imagePath] : []),
  ]);
}

test("each map ID and legacy ID names one map", () => {
  const seen = new Set<string>();
  const reused = MAPS.flatMap((map) =>
    [map.id, ...map.legacyIds].filter((id) => {
      const duplicate = seen.has(id);
      seen.add(id);
      return duplicate;
    }),
  );
  expect(reused, "Map IDs and legacy IDs must be unique.").toEqual([]);
});

test("each catalog image exists in static/", async () => {
  const missing: string[] = [];
  for (const path of catalogImages()) {
    try {
      await access(new URL(`.${path}`, STATIC));
    } catch {
      missing.push(path);
    }
  }
  expect(missing, "Add the image file or fix the path in src/maps.ts.").toEqual(
    [],
  );
});

test("each map image in static/ has a catalog entry", async () => {
  const listed = new Set(catalogImages());
  const files = [
    ...(await readdir(new URL("maps/", STATIC))).map((file) => `/maps/${file}`),
    ...(await readdir(new URL("map-previews/", STATIC))).map(
      (file) => `/map-previews/${file}`,
    ),
  ];
  expect(
    files.filter((file) => !listed.has(file)),
    "Add a src/maps.ts entry that uses each map image.",
  ).toEqual([]);
});

test("every stored map ID still resolves to a map", async () => {
  const removed = (await idSnapshot()).filter((id) => !findMap(id));
  expect(
    removed,
    "Stored comps and boards use these IDs. Keep each one as an id or in legacyIds of the map that replaces it.",
  ).toEqual([]);
});

test("the stored map ID snapshot lists every catalog ID", async () => {
  const snapshot = new Set(await idSnapshot());
  const unlisted = MAPS.flatMap((map) => [map.id, ...map.legacyIds]).filter(
    (id) => !snapshot.has(id),
  );
  expect(unlisted, "Add new map IDs to tests/fixtures/mapIds.json.").toEqual(
    [],
  );
});

test("stored comps with short map IDs and boards with mode map IDs still load", async () => {
  const library = await readFile(
    new URL("./fixtures/stored/comp-library-midtown.json", import.meta.url),
    "utf8",
  );
  const { workspace, library: comps } = decodeStoredRecords(
    {
      library,
      board: await readJson("./fixtures/stored/board-midtown-convoy.json"),
      openComp: undefined,
      customMaps: [],
    },
    "boot",
  );
  expect(comps.errors).toEqual([]);
  expect(comps.entries.map(({ comp }) => comp.mapIds)).toEqual([
    ["midtown"],
    ["midtown"],
  ]);
  expect(workspace.board.map).toEqual({ kind: "builtin", id: "midtown" });
  expect(workspace.board.tokens.map((token) => token.id)).toEqual([
    "ally-hulk",
  ]);
  expect(workspace.board.drawingsByMap).toEqual({
    midtown: [
      {
        id: "note",
        kind: "note",
        x: 30,
        y: 40,
        color: "#ffd166",
        text: "Rotate",
        width: 180,
      },
    ],
  });
});
