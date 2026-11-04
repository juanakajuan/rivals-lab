import { access, readFile, readdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { MAPS, findBoardMap, findMap, type BoardStage } from "../src/maps";
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
    ...map.stages.flatMap((stage) => [stage.image.imagePath, stage.thumb]),
    ...("preview" in map ? [map.preview.imagePath] : []),
  ]);
}

function webpSize(file: Buffer): { width: number; height: number } {
  if (
    file.toString("ascii", 0, 4) !== "RIFF" ||
    file.toString("ascii", 8, 12) !== "WEBP"
  )
    throw new Error("Not a WebP file.");
  const chunk = file.toString("ascii", 12, 16);
  if (chunk === "VP8X")
    return {
      width: file.readUIntLE(24, 3) + 1,
      height: file.readUIntLE(27, 3) + 1,
    };
  if (chunk === "VP8 ")
    return {
      width: file.readUInt16LE(26) & 0x3fff,
      height: file.readUInt16LE(28) & 0x3fff,
    };
  if (chunk === "VP8L") {
    const bits = file.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  throw new Error(`Unknown WebP chunk ${chunk}.`);
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

test("each stage ID names one stage of one map", () => {
  const stageIds = MAPS.flatMap((map) => map.stages.map((stage) => stage.id));
  expect(
    stageIds.filter((id, index) => stageIds.indexOf(id) !== index),
    "Stage IDs must be unique.",
  ).toEqual([]);
  const owners = new Map<string, Set<string>>();
  for (const map of MAPS)
    for (const id of [
      map.id,
      ...map.legacyIds,
      ...map.stages.map((stage) => stage.id),
    ])
      owners.set(id, (owners.get(id) ?? new Set()).add(map.id));
  expect(
    [...owners].filter(([, maps]) => maps.size > 1).map(([id]) => id),
    "Each map ID, legacy ID, and stage ID must belong to one map.",
  ).toEqual([]);
  expect(
    MAPS.filter(
      (map) =>
        map.stages.length > 1 &&
        map.stages.some(
          (stage) =>
            stage.id === map.id ||
            map.legacyIds.some((legacyId: string) => legacyId === stage.id),
        ),
    ).map((map) => map.id),
    "Only a single-stage map may reuse its map ID as its stage ID.",
  ).toEqual([]);
  for (const map of MAPS)
    for (const stage of map.stages)
      expect(findBoardMap(stage.id), stage.id).toEqual({ map, stage });
});

test("a map ID or legacy ID opens the first stage of its map", () => {
  for (const map of MAPS)
    for (const id of [map.id, ...map.legacyIds])
      expect(findBoardMap(id), id).toEqual({ map, stage: map.stages[0] });
});

test("each stage declares the pixel size of its board image", async () => {
  const wrong: string[] = [];
  for (const { image } of MAPS.flatMap(
    (map): readonly BoardStage[] => map.stages,
  )) {
    const size = webpSize(
      await readFile(new URL(`.${image.imagePath}`, STATIC)),
    );
    if (size.width !== image.width || size.height !== image.height)
      wrong.push(
        `${image.imagePath} is ${size.width} x ${size.height}, not ${image.width} x ${image.height}`,
      );
  }
  expect(wrong, "Fix image.width and image.height in src/maps.ts.").toEqual([]);
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
    ...(await readdir(new URL("map-thumbs/", STATIC))).map(
      (file) => `/map-thumbs/${file}`,
    ),
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
  const unlisted = MAPS.flatMap((map) => [
    map.id,
    ...map.legacyIds,
    ...map.stages.map((stage) => stage.id),
  ]).filter((id) => !snapshot.has(id));
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
