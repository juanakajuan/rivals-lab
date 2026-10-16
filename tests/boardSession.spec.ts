import { expect, test } from "@playwright/test";
import { BoardSession, type BoardState } from "../src/boardSession";
import {
  MAX_DRAWINGS_PER_MAP,
  type BoardDrawing,
  type MapPoint,
  type MeasureBoardNote,
} from "../src/boardDrawings";
import { resolveBoardMap } from "../src/boardMaps";
import { clampToBoard, type BoardPoint } from "../src/boardTokens";
import { HEROES, TEAM_SIZE } from "../src/heroes";
import { emptyComp } from "../src/comps";
import { DEFAULT_MAP_ID } from "../src/maps";

const measureNote: MeasureBoardNote = (text, width) => {
  void text;
  void width;
  return { width: 180, height: 36 };
};

function onBoard(session: BoardSession, point: MapPoint): BoardPoint {
  const { board, iconSize } = session.getSnapshot();
  return clampToBoard(point, resolveBoardMap(board.map), iconSize);
}

const initial: BoardState = {
  map: { kind: "builtin", id: DEFAULT_MAP_ID },
  tokens: [
    { id: "ally-strange", heroId: "strange", team: "ally", x: 270, y: 435 },
  ],
  drawingsByMap: {},
};

test("map changes and position bounds form one reversible edit", () => {
  const session = new BoardSession(
    measureNote,
    {
      map: { kind: "builtin", id: "museum-of-contemplation" },
      tokens: [
        { id: "ally-strange", heroId: "strange", team: "ally", x: 270, y: 640 },
      ],
      drawingsByMap: {},
    },
    150,
  );
  const original = session.getSnapshot();
  expect(original.board.tokens[0]?.y).toBe(640);
  const changed = session.changeMap({
    kind: "builtin",
    id: "birnin-tchalla",
  });
  expect(changed).toMatchObject({
    board: {
      map: { kind: "builtin", id: "birnin-tchalla" },
      tokens: [
        { id: "ally-strange", heroId: "strange", team: "ally", x: 270, y: 618 },
      ],
      drawingsByMap: {},
    },
    iconSize: 150,
    canUndo: true,
    canRedo: false,
  });
  expect(session.clear().board.tokens).toEqual([]);
  expect(session.undo()).toMatchObject({ board: changed.board, canRedo: true });
  expect(session.undo()).toMatchObject({
    board: original.board,
    canUndo: false,
    canRedo: true,
  });
  const atStart = session.getSnapshot();
  expect(session.undo()).toBe(atStart);
  expect(session.redo()).toMatchObject({ board: changed.board, canRedo: true });
  expect(session.redo().board.tokens).toEqual([]);
  expect(session.getSnapshot().canRedo).toBe(false);
  const atEnd = session.getSnapshot();
  expect(session.redo()).toBe(atEnd);
});

test("unchanged edits retain the state reference and redo; a new edit clears redo", () => {
  const session = new BoardSession(measureNote, initial);
  session.clear();
  const restored = session.undo();
  expect(restored.canRedo).toBe(true);
  expect(
    session.moveToken({
      id: "ally-strange",
      point: onBoard(session, { x: 270, y: 435 }),
    }),
  ).toBe(restored);
  expect(
    session.moveToken({
      id: "missing",
      point: onBoard(session, { x: 400, y: 400 }),
    }),
  ).toBe(restored);
  expect(session.removeToken("missing")).toBe(restored);
  expect(session.removeDrawing("missing")).toBe(restored);
  expect(
    session.moveDrawing({ id: "missing", delta: { x: 10, y: 0 } }),
  ).toBeNull();
  expect(session.changeMap({ kind: "builtin", id: DEFAULT_MAP_ID })).toBe(
    restored,
  );
  expect(session.addHero({ heroId: "strange", team: "ally" })).toEqual({
    kind: "existing",
  });
  session.placeHero({
    heroId: "strange",
    team: "ally",
    point: onBoard(session, { x: 270, y: 435 }),
  });
  expect(session.getSnapshot()).toBe(restored);
  session.removeToken("ally-strange");
  const edited = session.getSnapshot();
  expect(edited.canRedo).toBe(false);
  expect(session.clear()).toBe(edited);
  expect(session.redo()).toBe(edited);
  expect(session.undo().board.tokens).toEqual(initial.tokens);
  const defaults = new BoardSession(measureNote);
  const unchanged = defaults.getSnapshot();
  expect(defaults.reset()).toBe(unchanged);
});

test("history retains the last 100 edits in order and supports branching", () => {
  const session = new BoardSession(measureNote, initial);
  for (let x = 300; x <= 404; x++) {
    session.moveToken({
      id: "ally-strange",
      point: onBoard(session, { x, y: 435 }),
    });
  }
  for (let x = 403; x >= 304; x--) {
    expect(session.undo().board.tokens[0]?.x).toBe(x);
  }
  expect(session.getSnapshot().canUndo).toBe(false);
  const oldest = session.getSnapshot();
  expect(session.undo()).toBe(oldest);
  expect(
    session.moveToken({
      id: "ally-strange",
      point: onBoard(session, { x: 304, y: 435 }),
    }),
  ).toBe(oldest);
  for (let x = 305; x <= 404; x++) {
    expect(session.redo().board.tokens[0]?.x).toBe(x);
  }
  expect(session.getSnapshot().canRedo).toBe(false);
  session.undo();
  session.removeToken("ally-strange");
  expect(session.getSnapshot().canRedo).toBe(false);
  expect(session.redo().board.tokens).toEqual([]);
  expect(session.undo().board.tokens[0]?.x).toBe(403);
});

test("placement bounds, team identity, and free positions use the current icon size", () => {
  const session = new BoardSession(
    measureNote,
    { ...initial, tokens: [] },
    150,
  );
  expect(
    session.placeHero({
      heroId: "angela",
      team: "ally",
      point: onBoard(session, { x: -10, y: 999 }),
    }),
  ).toEqual({
    kind: "added",
    token: { id: "ally-angela", heroId: "angela", team: "ally", x: 36, y: 618 },
  });
  session.setIconSize(100);
  expect(session.addHero({ heroId: "angela", team: "enemy" })).toEqual({
    kind: "added",
    token: {
      id: "enemy-angela",
      heroId: "angela",
      team: "enemy",
      x: 652,
      y: 52,
    },
  });
  session.setIconSize(150);
  expect(session.addHero({ heroId: "strange", team: "ally" })).toEqual({
    kind: "added",
    token: {
      id: "ally-strange",
      heroId: "strange",
      team: "ally",
      x: 76,
      y: 76,
    },
  });
  session.setIconSize(100);
  expect(
    session.placeHero({
      heroId: "angela",
      team: "ally",
      point: onBoard(session, { x: 9999, y: -10 }),
    }),
  ).toEqual({
    kind: "moved",
    token: {
      id: "ally-angela",
      heroId: "angela",
      team: "ally",
      x: 1176,
      y: 24,
    },
  });
  expect(session.getSnapshot().board.tokens).toHaveLength(3);
  expect(session.undo().board.tokens[0]).toEqual({
    id: "ally-angela",
    heroId: "angela",
    team: "ally",
    x: 36,
    y: 618,
  });
});

test("free placement uses visible positions", () => {
  const session = new BoardSession(
    measureNote,
    {
      ...initial,
      tokens: [
        { id: "ally-strange", heroId: "strange", team: "ally", x: 0, y: 0 },
      ],
    },
    150,
  );
  expect(session.addHero({ heroId: "angela", team: "ally" })).toMatchObject({
    token: { x: 152, y: 76 },
  });
});

test("teams cap additions without blocking moves or changing history on rejection", () => {
  const session = new BoardSession(measureNote, { ...initial, tokens: [] });
  for (const team of ["ally", "enemy"] as const) {
    for (const hero of HEROES.slice(0, TEAM_SIZE)) {
      expect(session.addHero({ heroId: hero.id, team }).kind).toBe("added");
    }
    const full = session.getSnapshot();
    expect(session.addHero({ heroId: "luna", team })).toEqual({
      kind: "team-full",
    });
    expect(
      session.placeHero({
        heroId: "luna",
        team,
        point: onBoard(session, { x: 200, y: 200 }),
      }),
    ).toEqual({ kind: "team-full" });
    expect(session.getSnapshot()).toBe(full);
    expect(
      session.placeHero({
        heroId: "angela",
        team,
        point: onBoard(session, { x: 200, y: 200 }),
      }).kind,
    ).toBe("moved");
    session.undo();
    const withRedo = session.getSnapshot();
    session.addHero({ heroId: "luna", team });
    expect(session.getSnapshot()).toBe(withRedo);
    session.removeToken(`${team}-angela`);
    expect(session.addHero({ heroId: "luna", team }).kind).toBe("added");
  }
});

test("drawings remain isolated by map through edit, clear, reset, and history", () => {
  const session = new BoardSession(measureNote, initial);
  const note: BoardDrawing = {
    id: "note",
    kind: "note",
    x: 30,
    y: 40,
    color: "#ffd166",
    text: "Rotate",
    width: 180,
  };
  session.editDrawing(note);
  const withNote = session.getSnapshot();
  expect(session.editDrawing({ ...note })).toBe(withNote);
  expect(
    session.moveDrawing({ id: "note", delta: { x: -10, y: 9999 } }),
  ).toEqual({ ...note, x: 20, y: 618 });
  expect(session.undo().board.drawingsByMap[DEFAULT_MAP_ID]).toEqual([note]);
  session.changeMap({ kind: "builtin", id: "hells-heaven" });
  const arrow = session.addDrawing({ kind: "arrow", color: "#ff6268" });
  if (!arrow) throw new Error("Expected an arrow.");
  expect(arrow).toMatchObject({
    kind: "arrow",
    x: 520,
    y: 288.5,
    dx: 160,
    dy: 80,
    color: "#ff6268",
  });
  expect(session.clear().board.drawingsByMap).toEqual({
    [DEFAULT_MAP_ID]: [note],
    "hells-heaven": [],
  });
  expect(session.undo().board.drawingsByMap["hells-heaven"]).toEqual([arrow]);
  expect(session.reset().board.drawingsByMap).toEqual({
    [DEFAULT_MAP_ID]: [note],
    "hells-heaven": [],
  });
  expect(session.undo().board.drawingsByMap["hells-heaven"]).toEqual([arrow]);
  session.removeDrawing(arrow.id);
  expect(session.getSnapshot().board.drawingsByMap["hells-heaven"]).toEqual([]);
  expect(session.undo().board.drawingsByMap["hells-heaven"]).toEqual([arrow]);
});

test("comp transfer preserves drawings and roles and restores map and formation together", () => {
  const note: BoardDrawing = {
    id: "note",
    kind: "note",
    x: 30,
    y: 40,
    color: "#ffd166",
    text: "Rotate",
    width: 180,
  };
  const session = new BoardSession(measureNote, {
    ...initial,
    drawingsByMap: { [DEFAULT_MAP_ID]: [note] },
  });
  const comp = {
    ...emptyComp(),
    teams: {
      ally: [
        { heroId: "deadpool", deadpoolRole: "Duelist", notes: "" },
        { heroId: null, notes: "" },
        { heroId: "luna", notes: "" },
      ],
      enemy: [{ heroId: "magneto", notes: "" }],
    },
  } satisfies ReturnType<typeof emptyComp>;
  const transferred = session.openComp({
    comp,
    mapId: "museum-of-contemplation",
  });
  expect(transferred.board.tokens).toEqual([
    {
      id: "ally-deadpool",
      heroId: "deadpool",
      team: "ally",
      deadpoolRole: "Duelist",
      x: 268,
      y: 197,
    },
    { id: "ally-luna", heroId: "luna", team: "ally", x: 268, y: 277 },
    { id: "enemy-magneto", heroId: "magneto", team: "enemy", x: 868, y: 197 },
  ]);
  expect(transferred.board.drawingsByMap).toEqual({ [DEFAULT_MAP_ID]: [note] });
  expect(session.undo()).toMatchObject({
    board: { ...initial, drawingsByMap: { [DEFAULT_MAP_ID]: [note] } },
    canUndo: false,
    canRedo: true,
  });
  expect(session.redo().board).toEqual(transferred.board);
  const changed = session.openComp({
    comp: {
      ...comp,
      teams: {
        ...comp.teams,
        ally: [{ heroId: "deadpool", deadpoolRole: "Strategist", notes: "" }],
      },
    },
    mapId: "museum-of-contemplation",
  });
  expect(changed.board.tokens[0]?.deadpoolRole).toBe("Strategist");
  expect(session.undo()).toMatchObject({
    board: transferred.board,
    canRedo: true,
  });
  expect(session.redo().board).toEqual(changed.board);
});

test("icon size changes visible bounds without a history edit", () => {
  const session = new BoardSession(
    measureNote,
    {
      ...initial,
      tokens: [
        { id: "ally-strange", heroId: "strange", team: "ally", x: 12, y: 12 },
      ],
    },
    50,
  );
  const larger = session.setIconSize(150);
  expect(larger.canUndo).toBe(false);
  expect(larger.board.tokens[0]).toMatchObject({ x: 12, y: 12 });
  expect(larger.tokens[0]).toMatchObject({ x: 36, y: 36 });
  const smaller = session.setIconSize(50);
  expect(smaller.board.tokens[0]).toMatchObject({ x: 12, y: 12 });
  expect(smaller.tokens[0]).toMatchObject({ x: 12, y: 12 });
  expect(session.undo()).toBe(smaller);
});

test("a map refuses drawings past the stored limit", () => {
  const drawings: BoardDrawing[] = Array.from(
    { length: MAX_DRAWINGS_PER_MAP },
    (_, index) => ({
      id: `arrow-${index}`,
      kind: "arrow",
      x: 100,
      y: 100,
      dx: 40,
      dy: 20,
      color: "#ffd166",
    }),
  );
  const session = new BoardSession(measureNote, {
    ...initial,
    drawingsByMap: { [DEFAULT_MAP_ID]: drawings },
  });
  const full = session.getSnapshot();
  expect(session.addDrawing({ kind: "zone", color: "#ffffff" })).toBeNull();
  expect(session.getSnapshot()).toBe(full);
  const first = drawings[0];
  if (!first) throw new Error("Expected a drawing.");
  const edited = session.editDrawing({ ...first, color: "#000000" });
  expect(edited.board.drawingsByMap[DEFAULT_MAP_ID]).toHaveLength(
    MAX_DRAWINGS_PER_MAP,
  );
  expect(edited.board.drawingsByMap[DEFAULT_MAP_ID]?.[0]?.color).toBe(
    "#000000",
  );
});

test("getSnapshot returns the same object until a change, then a new object", () => {
  const session = new BoardSession(
    measureNote,
    {
      ...initial,
      tokens: [
        { id: "ally-strange", heroId: "strange", team: "ally", x: 0, y: 0 },
      ],
    },
    150,
  );
  let notified = 0;
  const unsubscribe = session.subscribe(() => {
    notified += 1;
  });
  const first = session.getSnapshot();
  expect(session.getSnapshot()).toBe(first);
  expect(first.tokens).toEqual([
    { id: "ally-strange", heroId: "strange", team: "ally", x: 36, y: 36 },
  ]);
  session.removeToken("missing");
  session.setIconSize(150);
  session.undo();
  expect(session.getSnapshot()).toBe(first);
  expect(notified).toBe(0);

  session.moveToken({
    id: "ally-strange",
    point: onBoard(session, { x: 300, y: 400 }),
  });
  const moved = session.getSnapshot();
  expect(moved).not.toBe(first);
  expect(session.getSnapshot()).toBe(moved);
  expect(moved.tokens).toEqual([
    { id: "ally-strange", heroId: "strange", team: "ally", x: 300, y: 400 },
  ]);
  expect(notified).toBe(1);

  session.setIconSize(50);
  expect(session.getSnapshot()).not.toBe(moved);
  expect(session.getSnapshot().boardRevision).toBe(moved.boardRevision);
  expect(notified).toBe(2);

  unsubscribe();
  session.undo();
  expect(session.getSnapshot().board.tokens).toEqual([
    { id: "ally-strange", heroId: "strange", team: "ally", x: 0, y: 0 },
  ]);
  expect(notified).toBe(2);
});
