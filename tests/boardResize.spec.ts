import { expect, test } from "@playwright/test";
import {
  createDrawing,
  decodeDrawing,
  drawingHandles,
  equalDrawings,
  moveDrawing,
  resizeDrawing,
  type ArrowDrawing,
  type BoardPoint,
  type DrawingHandle,
  type MeasureBoardNote,
  type NoteDrawing,
  type ZoneDrawing,
} from "../src/boardDrawings";

const map = { width: 1200, height: 654 };

const shrinking: MeasureBoardNote = (_text, width) => ({
  width,
  height: width < 80 ? 90 : 30,
});

const alwaysTall: MeasureBoardNote = (_text, width) => ({
  width,
  height: 500,
});

const arrow: ArrowDrawing = {
  id: "arrow",
  kind: "arrow",
  x: 100,
  y: 80,
  dx: 40,
  dy: 30,
  color: "#ffd166",
};

const zone: ZoneDrawing = {
  id: "zone",
  kind: "zone",
  x: 100,
  y: 80,
  width: 80,
  height: 60,
  color: "#67d5e8",
};

const note: NoteDrawing = {
  id: "note",
  kind: "note",
  x: 40,
  y: 50,
  color: "#ffd166",
  text: "Hold here",
  width: 180,
};

const tip: DrawingHandle = {
  kind: "arrow",
  id: "tip",
  at: { x: 140, y: 110 },
  cursor: "crosshair",
};

const tail: DrawingHandle = {
  kind: "arrow",
  id: "tail",
  at: { x: 100, y: 80 },
  cursor: "crosshair",
};

const east: DrawingHandle = {
  kind: "zone",
  id: "e",
  at: { x: 180, y: 110 },
  cursor: "ew-resize",
};

const west: DrawingHandle = {
  kind: "zone",
  id: "w",
  at: { x: 100, y: 110 },
  cursor: "ew-resize",
};

const southEast: DrawingHandle = {
  kind: "zone",
  id: "se",
  at: { x: 180, y: 140 },
  cursor: "nwse-resize",
};

const northWest: DrawingHandle = {
  kind: "zone",
  id: "nw",
  at: { x: 100, y: 80 },
  cursor: "nwse-resize",
};

const noteEast: DrawingHandle = {
  kind: "note",
  id: "e",
  at: { x: 220, y: 65 },
  cursor: "ew-resize",
};

const noteWest: DrawingHandle = {
  kind: "note",
  id: "w",
  at: { x: 40, y: 65 },
  cursor: "ew-resize",
};

function resizeTwice(
  drawing: ArrowDrawing | ZoneDrawing | NoteDrawing,
  handle: DrawingHandle,
  pointer: BoardPoint,
  bounds: { readonly width: number; readonly height: number },
  measure: MeasureBoardNote,
) {
  return {
    once: resizeDrawing(drawing, handle, pointer, bounds, measure),
    twice: resizeDrawing(drawing, handle, pointer, bounds, measure),
  };
}

test("drawing handles sit on arrow ends, zone edges, and note sides", () => {
  expect(drawingHandles(arrow, shrinking)).toEqual([
    {
      kind: "arrow",
      id: "tail",
      at: { x: 100, y: 80 },
      cursor: "crosshair",
    },
    {
      kind: "arrow",
      id: "tip",
      at: { x: 140, y: 110 },
      cursor: "crosshair",
    },
  ]);
  expect(drawingHandles(zone, shrinking)).toEqual([
    { kind: "zone", id: "n", at: { x: 140, y: 80 }, cursor: "ns-resize" },
    { kind: "zone", id: "e", at: { x: 180, y: 110 }, cursor: "ew-resize" },
    { kind: "zone", id: "s", at: { x: 140, y: 140 }, cursor: "ns-resize" },
    { kind: "zone", id: "w", at: { x: 100, y: 110 }, cursor: "ew-resize" },
    { kind: "zone", id: "ne", at: { x: 180, y: 80 }, cursor: "nesw-resize" },
    { kind: "zone", id: "se", at: { x: 180, y: 140 }, cursor: "nwse-resize" },
    { kind: "zone", id: "sw", at: { x: 100, y: 140 }, cursor: "nesw-resize" },
    { kind: "zone", id: "nw", at: { x: 100, y: 80 }, cursor: "nwse-resize" },
  ]);
  expect(
    drawingHandles(note, (_text, width) => ({ width, height: 36 })),
  ).toEqual([
    { kind: "note", id: "w", at: { x: 40, y: 68 }, cursor: "ew-resize" },
    { kind: "note", id: "e", at: { x: 220, y: 68 }, cursor: "ew-resize" },
  ]);
});

test("dragging an arrow tip moves that end and keeps the tail", () => {
  const moved = {
    ...arrow,
    dx: 70,
    dy: 50,
  };
  const { once, twice } = resizeTwice(
    arrow,
    tip,
    { x: 170, y: 130 },
    map,
    shrinking,
  );
  expect(once).toEqual(moved);
  expect(twice).toEqual(moved);
});

test("dragging an arrow tip past the tail reverses direction", () => {
  expect(resizeDrawing(arrow, tip, { x: 40, y: 80 }, map, shrinking)).toEqual({
    ...arrow,
    dx: -60,
    dy: 0,
  });
});

test("an arrow tip dropped on the tail keeps a length of at least 8", () => {
  const straight: ArrowDrawing = { ...arrow, dx: 30, dy: 40 };
  expect(
    resizeDrawing(straight, tip, { x: 100, y: 80 }, map, shrinking),
  ).toEqual({
    ...straight,
    dx: 5,
    dy: 7,
  });
});

test("a zero-length arrow grows east when the pointer stays on the tail", () => {
  const flat: ArrowDrawing = { ...arrow, x: 40, y: 50, dx: 0, dy: 0 };
  expect(
    resizeDrawing(
      flat,
      { ...tip, at: { x: 40, y: 50 } },
      { x: 40, y: 50 },
      map,
      shrinking,
    ),
  ).toEqual({ ...flat, dx: 8, dy: 0 });
});

test("an arrow tip blocked by the map edge pushes back inside at length 8", () => {
  const nearEdge: ArrowDrawing = {
    ...arrow,
    x: 1196,
    y: 100,
    dx: 4,
    dy: 0,
  };
  expect(
    resizeDrawing(nearEdge, tip, { x: 1200, y: 100 }, map, shrinking),
  ).toEqual({
    ...nearEdge,
    dx: -8,
    dy: 3,
  });
});

test("dragging an arrow tail leaves the tip in place", () => {
  expect(resizeDrawing(arrow, tail, { x: 20, y: 40 }, map, shrinking)).toEqual({
    ...arrow,
    x: 20,
    y: 40,
    dx: 120,
    dy: 70,
  });
});

test("an arrow anchor outside the map is pulled inside before the free end moves", () => {
  const hanging: ArrowDrawing = { ...arrow, x: -30, y: -10, dx: 50, dy: 40 };
  expect(resizeDrawing(hanging, tip, { x: 80, y: 70 }, map, shrinking)).toEqual(
    {
      ...hanging,
      x: 0,
      y: 0,
      dx: 80,
      dy: 70,
    },
  );
});

test("an arrow on a map shorter than 8 keeps both ends inside without a forced length", () => {
  const tiny = { width: 3, height: 4 };
  const short: ArrowDrawing = {
    ...arrow,
    x: 0,
    y: 0,
    dx: 1,
    dy: 0,
  };
  expect(resizeDrawing(short, tip, { x: 10, y: 10 }, tiny, shrinking)).toEqual({
    ...short,
    dx: 3,
    dy: 4,
  });
});

test("a mismatched handle returns the original arrow", () => {
  expect(
    resizeDrawing(arrow, southEast, { x: 10, y: 10 }, map, shrinking),
  ).toBe(arrow);
});

test("dragging a zone edge changes that span and keeps the anchor", () => {
  const grown = { ...zone, width: 150 };
  const { once, twice } = resizeTwice(
    zone,
    east,
    { x: 250, y: 80 },
    map,
    shrinking,
  );
  expect(once).toEqual(grown);
  expect(twice).toEqual(grown);
  expect(resizeDrawing(zone, west, { x: 140, y: 90 }, map, shrinking)).toEqual({
    ...zone,
    x: 140,
    width: 40,
  });
});

test("a zone edge stops at the 8 pixel floor instead of crossing the anchor", () => {
  expect(resizeDrawing(zone, west, { x: 400, y: 80 }, map, shrinking)).toEqual({
    ...zone,
    x: 172,
    width: 8,
  });
  expect(
    resizeDrawing(zone, northWest, { x: 300, y: 400 }, map, shrinking),
  ).toEqual({
    ...zone,
    x: 172,
    y: 132,
    width: 8,
    height: 8,
  });
});

test("dragging a zone corner sets both edges from the pointer", () => {
  expect(
    resizeDrawing(zone, southEast, { x: 250, y: 220 }, map, shrinking),
  ).toEqual({
    ...zone,
    width: 150,
    height: 140,
  });
});

test("a zone pressed against the map slides the anchor to keep an 8 pixel span", () => {
  const pressed: ZoneDrawing = { ...zone, x: 1196, width: 4 };
  expect(
    resizeDrawing(pressed, east, { x: 1300, y: 80 }, map, shrinking),
  ).toEqual({
    ...pressed,
    x: 1192,
    width: 8,
  });
});

test("a fixed zone axis slides into the map without changing its span", () => {
  const hanging: ZoneDrawing = { ...zone, x: -20, width: 100 };
  expect(
    resizeDrawing(
      hanging,
      { kind: "zone", id: "s", at: { x: 30, y: 140 }, cursor: "ns-resize" },
      { x: 30, y: 200 },
      map,
      shrinking,
    ),
  ).toEqual({
    ...hanging,
    x: 0,
    width: 100,
    height: 120,
  });
});

test("a zone on a map shorter than 8 uses the room on that axis", () => {
  const tight = { width: 5, height: 100 };
  expect(
    resizeDrawing(
      { ...zone, x: 1, y: 10, width: 3, height: 40 },
      southEast,
      { x: 4, y: 80 },
      tight,
      shrinking,
    ),
  ).toEqual({
    ...zone,
    x: 0,
    y: 10,
    width: 5,
    height: 70,
  });
});

test("zone resize rounds the pointer and repeats the span floor", () => {
  expect(
    resizeDrawing(zone, east, { x: 150.4, y: 80 }, map, shrinking),
  ).toEqual({
    ...zone,
    width: 50,
  });
});

test("a mismatched handle returns the original zone", () => {
  expect(resizeDrawing(zone, tip, { x: 10, y: 10 }, map, shrinking)).toBe(zone);
});

test("dragging a note's east handle keeps the left edge and stores the new width", () => {
  const widened = { ...note, width: 260 };
  const { once, twice } = resizeTwice(
    note,
    noteEast,
    { x: 300, y: 50 },
    map,
    shrinking,
  );
  expect(once).toEqual(widened);
  expect(twice).toEqual(widened);
  expect(moveDrawing(once, once.x, once.y, map, shrinking)).toEqual(widened);
});

test("dragging a note's west handle keeps the right edge", () => {
  expect(
    resizeDrawing(note, noteWest, { x: 100, y: 40 }, map, shrinking),
  ).toEqual({
    ...note,
    x: 100,
    width: 120,
  });
});

test("a note handle stops at the text floor instead of crossing the anchor", () => {
  expect(
    resizeDrawing(note, noteEast, { x: 50, y: 50 }, map, shrinking),
  ).toEqual({ ...note, width: 36 });
  expect(
    resizeDrawing(note, noteWest, { x: 400, y: 50 }, map, shrinking),
  ).toEqual({
    ...note,
    x: 184,
    width: 36,
  });
});

test("a note that is too tall at the proposed width grows only wider until it fits", () => {
  const shortMap = { width: 300, height: 40 };
  const tucked = { ...note, y: 0 };
  expect(
    resizeDrawing(tucked, noteEast, { x: 90, y: 0 }, shortMap, shrinking),
  ).toEqual({
    ...tucked,
    width: 80,
  });
  expect(
    resizeDrawing(tucked, noteWest, { x: 190, y: 0 }, shortMap, shrinking),
  ).toEqual({
    ...tucked,
    x: 140,
    width: 80,
  });
  const edge = { ...note, x: 250, y: 0, width: 40 };
  const slid = { ...edge, x: 220, width: 80 };
  const resized = resizeDrawing(
    edge,
    noteEast,
    { x: 270, y: 0 },
    shortMap,
    shrinking,
  );
  expect(resized).toEqual(slid);
  expect(
    moveDrawing(resized, resized.x, resized.y, shortMap, shrinking),
  ).toEqual(slid);
});

test("a note taller than the map at every width stays the pointer-down note", () => {
  const shortMap = { width: 200, height: 100 };
  expect(
    resizeDrawing(note, noteEast, { x: 80, y: 50 }, shortMap, alwaysTall),
  ).toBe(note);
});

test("a resized note that fits is a fixed point of moveDrawing", () => {
  const low: NoteDrawing = { ...note, y: 640 };
  const fitted = {
    ...low,
    y: 624,
    width: 260,
  };
  const resized = resizeDrawing(
    low,
    noteEast,
    { x: 300, y: 640 },
    map,
    shrinking,
  );
  expect(resized).toEqual(fitted);
  expect(moveDrawing(resized, resized.x, resized.y, map, shrinking)).toEqual(
    fitted,
  );
});

test("decode fills a missing note width and rejects a bad one", () => {
  expect(
    decodeDrawing({
      id: "n1",
      kind: "note",
      x: 12,
      y: 40,
      color: "#ffd166",
      text: "New note",
    }),
  ).toEqual({
    id: "n1",
    kind: "note",
    x: 12,
    y: 40,
    color: "#ffd166",
    text: "New note",
    width: 180,
  });
  expect(
    decodeDrawing({
      id: "n2",
      kind: "note",
      x: 1,
      y: 2,
      color: "#ffffff",
      text: "Wide",
      width: 90,
    }),
  ).toEqual({
    id: "n2",
    kind: "note",
    x: 1,
    y: 2,
    color: "#ffffff",
    text: "Wide",
    width: 90,
  });
  expect(() =>
    decodeDrawing({
      id: "n3",
      kind: "note",
      x: 0,
      y: 0,
      color: "#ffffff",
      text: "Bad",
      width: -1,
    }),
  ).toThrow("Invalid drawing position or size.");
  expect(() =>
    decodeDrawing({
      id: "n4",
      kind: "note",
      x: 0,
      y: 0,
      color: "#ffffff",
      text: "Bad",
      width: Number.NaN,
    }),
  ).toThrow("Invalid drawing position or size.");
});

test("note equality includes width, and a new note starts at 180", () => {
  expect(equalDrawings([note], [{ ...note, width: 200 }])).toBe(false);
  expect(equalDrawings([note], [note])).toBe(true);
  const created = createDrawing(
    "note",
    { x: 12, y: 40 },
    { x: 20, y: 48 },
    "#ffd166",
  );
  expect({ ...created, id: "note-id" }).toEqual({
    id: "note-id",
    kind: "note",
    x: 12,
    y: 40,
    color: "#ffd166",
    text: "New note",
    width: 180,
  });
});

test("moveDrawing measures a note at its stored width", () => {
  const narrow: NoteDrawing = { ...note, width: 50 };
  expect(
    moveDrawing(narrow, 10, 9999, map, (_text, width) => ({
      width,
      height: width + 10,
    })),
  ).toEqual({
    ...narrow,
    x: 10,
    y: 594,
  });
});
