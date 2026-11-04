import { expect, test } from "@playwright/test";
import { BoardSession, type BoardState } from "../src/boardSession";
import {
  MAX_DRAWINGS_PER_MAP,
  type BoardDrawing,
  type BoardSize,
  type MapPoint,
  type MeasureBoardNote,
} from "../src/boardDrawings";
import { resolveBoardMap, type BoardMapDefinition } from "../src/boardMaps";
import {
  DEFAULT_ICON_SIZE,
  clampToBoard,
  tokenBoundary,
  type BoardPoint,
  type IconSize,
} from "../src/boardTokens";
import { HEROES, TEAM_SIZE, type Team } from "../src/heroes";
import { emptyComp } from "../src/comps";
import { DEFAULT_MAP_ID, type BuiltinBoardMapId } from "../src/maps";
import {
  BOARD_RECORD_VERSION,
  decodeBoardRecord,
} from "../src/workspaceRecord";
import { DEFAULT_BOARD } from "./boardGeometry";
import { exampleToken } from "./boardSetup";

const NOTE_SIZE: BoardSize = { width: 180, height: 36 };

const measureNote: MeasureBoardNote = (text, width) => {
  void text;
  void width;
  return NOTE_SIZE;
};

const MUSEUM: BuiltinBoardMapId = "museum-of-contemplation";
const HELLS_HEAVEN: BuiltinBoardMapId = "hells-heaven-airfield-base";

function builtin(id: BuiltinBoardMapId): BoardMapDefinition {
  return resolveBoardMap({ kind: "builtin", id });
}

function onBoard(session: BoardSession, point: MapPoint): BoardPoint {
  const { board, iconSize } = session.getSnapshot();
  return clampToBoard(point, resolveBoardMap(board.map), iconSize);
}

function tokenSpacing(iconSize: IconSize): number {
  return tokenBoundary(iconSize) * 2 + 4;
}

function teamHalfStart(map: BoardSize, team: Team): number {
  return Math.floor(map.width * (team === "ally" ? 0 : 0.5));
}

function compSlot(
  map: BoardSize,
  team: Team,
  index: number,
  iconSize: IconSize,
): BoardPoint {
  return clampToBoard(
    {
      x: map.width * (team === "ally" ? 0.25 : 0.75) + (index % 2) * 65 - 32,
      y: map.height * 0.3 + Math.floor(index / 2) * 80,
    },
    map,
    iconSize,
  );
}

const strange = exampleToken("strange");

const initial: BoardState = {
  map: { kind: "builtin", id: DEFAULT_MAP_ID },
  tokens: [strange],
  drawingsByMap: {},
};

test("map changes and position bounds form one reversible edit", () => {
  const iconSize: IconSize = 150;
  const boundary = tokenBoundary(iconSize);
  const start = builtin(MUSEUM);
  const target = builtin(DEFAULT_MAP_ID);
  expect(start.width).toBeGreaterThan(target.width);
  const edge = {
    x: Math.round(start.width - boundary),
    y: Math.round(start.height / 2),
  };
  const session = new BoardSession(
    measureNote,
    {
      map: { kind: "builtin", id: MUSEUM },
      tokens: [{ ...strange, ...edge }],
      drawingsByMap: {},
    },
    iconSize,
  );
  const original = session.getSnapshot();
  expect(original.board.tokens[0]).toMatchObject(edge);
  const changed = session.changeMap({ kind: "builtin", id: DEFAULT_MAP_ID });
  expect(changed).toMatchObject({
    board: {
      map: { kind: "builtin", id: DEFAULT_MAP_ID },
      tokens: [
        {
          ...strange,
          x: Math.round(target.width - boundary),
          y: edge.y,
        },
      ],
      drawingsByMap: {},
    },
    iconSize,
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
    session.moveToken({ id: strange.id, point: onBoard(session, strange) }),
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
    point: onBoard(session, strange),
  });
  expect(session.getSnapshot()).toBe(restored);
  session.removeToken(strange.id);
  const edited = session.getSnapshot();
  expect(edited.canRedo).toBe(false);
  expect(session.clear()).toBe(edited);
  expect(session.redo()).toBe(edited);
  expect(session.undo().board.tokens).toEqual(initial.tokens);
});

test("a new board starts with no heroes", () => {
  const session = new BoardSession(measureNote);
  const empty = session.getSnapshot();
  expect(empty.board.tokens).toEqual([]);
  expect(session.clear()).toBe(empty);
});

test("history retains the last 100 edits in order and supports branching", () => {
  const session = new BoardSession(measureNote, initial);
  const first = tokenBoundary(DEFAULT_ICON_SIZE);
  const last = first + 104;
  expect(last).toBeLessThanOrEqual(DEFAULT_BOARD.width - first);
  for (let x = first; x <= last; x++) {
    session.moveToken({
      id: strange.id,
      point: onBoard(session, { x, y: strange.y }),
    });
  }
  for (let x = last - 1; x >= first + 4; x--) {
    expect(session.undo().board.tokens[0]?.x).toBe(x);
  }
  expect(session.getSnapshot().canUndo).toBe(false);
  const oldest = session.getSnapshot();
  expect(session.undo()).toBe(oldest);
  expect(
    session.moveToken({
      id: strange.id,
      point: onBoard(session, { x: first + 4, y: strange.y }),
    }),
  ).toBe(oldest);
  for (let x = first + 5; x <= last; x++) {
    expect(session.redo().board.tokens[0]?.x).toBe(x);
  }
  expect(session.getSnapshot().canRedo).toBe(false);
  session.undo();
  session.removeToken(strange.id);
  expect(session.getSnapshot().canRedo).toBe(false);
  expect(session.redo().board.tokens).toEqual([]);
  expect(session.undo().board.tokens[0]?.x).toBe(last - 1);
});

test("placement bounds, team identity, and free positions use the current icon size", () => {
  const map = builtin(DEFAULT_MAP_ID);
  const session = new BoardSession(
    measureNote,
    { ...initial, tokens: [] },
    150,
  );
  const corner = {
    x: tokenBoundary(150),
    y: Math.round(map.height - tokenBoundary(150)),
  };
  expect(
    session.placeHero({
      heroId: "angela",
      team: "ally",
      point: onBoard(session, { x: -10, y: map.height + 9999 }),
    }),
  ).toEqual({
    kind: "added",
    token: { id: "ally-angela", heroId: "angela", team: "ally", ...corner },
  });
  session.setIconSize(100);
  expect(session.addHero({ heroId: "angela", team: "enemy" })).toEqual({
    kind: "added",
    token: {
      id: "enemy-angela",
      heroId: "angela",
      team: "enemy",
      x: teamHalfStart(map, "enemy") + tokenSpacing(100),
      y: tokenSpacing(100),
    },
  });
  session.setIconSize(150);
  expect(session.addHero({ heroId: "strange", team: "ally" })).toEqual({
    kind: "added",
    token: {
      id: "ally-strange",
      heroId: "strange",
      team: "ally",
      x: teamHalfStart(map, "ally") + tokenSpacing(150),
      y: tokenSpacing(150),
    },
  });
  session.setIconSize(100);
  expect(
    session.placeHero({
      heroId: "angela",
      team: "ally",
      point: onBoard(session, { x: map.width + 9999, y: -10 }),
    }),
  ).toEqual({
    kind: "moved",
    token: {
      id: "ally-angela",
      heroId: "angela",
      team: "ally",
      x: Math.round(map.width - tokenBoundary(100)),
      y: tokenBoundary(100),
    },
  });
  expect(session.getSnapshot().board.tokens).toHaveLength(3);
  expect(session.undo().board.tokens[0]).toEqual({
    id: "ally-angela",
    heroId: "angela",
    team: "ally",
    ...corner,
  });
});

test("free placement uses visible positions", () => {
  const session = new BoardSession(
    measureNote,
    { ...initial, tokens: [{ ...strange, x: 0, y: 0 }] },
    150,
  );
  const spacing = tokenSpacing(150);
  expect(session.addHero({ heroId: "angela", team: "ally" })).toMatchObject({
    token: { x: spacing * 2, y: spacing },
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

test("drawings remain isolated by map through edit, clear, and history", () => {
  const session = new BoardSession(measureNote, initial);
  const note: BoardDrawing = {
    id: "note",
    kind: "note",
    x: 30,
    y: 40,
    color: "#ffd166",
    text: "Rotate",
    width: NOTE_SIZE.width,
  };
  session.editDrawing(note);
  const withNote = session.getSnapshot();
  expect(session.editDrawing({ ...note })).toBe(withNote);
  expect(
    session.moveDrawing({ id: "note", delta: { x: -10, y: 9999 } }),
  ).toEqual({
    ...note,
    x: 20,
    y: Math.round(DEFAULT_BOARD.height - NOTE_SIZE.height),
  });
  expect(session.undo().board.drawingsByMap[DEFAULT_MAP_ID]).toEqual([note]);
  session.changeMap({ kind: "builtin", id: HELLS_HEAVEN });
  const hellsHeaven = builtin(HELLS_HEAVEN);
  const arrow = session.addDrawing({ kind: "arrow", color: "#ff6268" });
  if (!arrow) throw new Error("Expected an arrow.");
  expect(arrow).toMatchObject({
    kind: "arrow",
    x: hellsHeaven.width / 2 - 80,
    y: hellsHeaven.height / 2 - 40,
    dx: 160,
    dy: 80,
    color: "#ff6268",
  });
  expect(session.clear().board.drawingsByMap).toEqual({
    [DEFAULT_MAP_ID]: [note],
    [HELLS_HEAVEN]: [],
  });
  expect(session.undo().board.drawingsByMap[HELLS_HEAVEN]).toEqual([arrow]);
  session.removeDrawing(arrow.id);
  expect(session.getSnapshot().board.drawingsByMap[HELLS_HEAVEN]).toEqual([]);
  expect(session.undo().board.drawingsByMap[HELLS_HEAVEN]).toEqual([arrow]);
});

test("a stored board clamps its drawings into their maps and reaches legacy-keyed drawings under the stage id", () => {
  const zone: BoardDrawing = {
    id: "zone",
    kind: "zone",
    x: 1000,
    y: 100,
    width: 120,
    height: 60,
    color: "#ffd166",
  };
  const note: BoardDrawing = {
    id: "note",
    kind: "note",
    x: 1000,
    y: 40,
    color: "#ffd166",
    text: "Rotate",
    width: NOTE_SIZE.width,
  };
  const stored = decodeBoardRecord(
    {
      version: BOARD_RECORD_VERSION,
      mapId: DEFAULT_MAP_ID,
      tokens: [],
      drawingsByMap: {
        [DEFAULT_MAP_ID]: [zone, note],
        "hells-heaven": [note],
      },
      iconSize: DEFAULT_ICON_SIZE,
    },
    [],
  );
  expect(stored.board.drawingsByMap[DEFAULT_MAP_ID]).toEqual([zone, note]);
  const session = new BoardSession(measureNote, stored.board);
  const portrait = builtin(DEFAULT_MAP_ID);
  const hellsHeaven = builtin(HELLS_HEAVEN);
  expect(session.getSnapshot().board.drawingsByMap).toEqual({
    [DEFAULT_MAP_ID]: [
      { ...zone, x: Math.round(portrait.width - zone.width) },
      { ...note, x: Math.round(portrait.width - NOTE_SIZE.width) },
    ],
    [HELLS_HEAVEN]: [
      { ...note, x: Math.round(hellsHeaven.width - NOTE_SIZE.width) },
    ],
  });
  session.changeMap({ kind: "builtin", id: HELLS_HEAVEN });
  expect(session.moveDrawing({ id: "note", delta: { x: 0, y: 0 } })).toEqual({
    ...note,
    x: Math.round(hellsHeaven.width - NOTE_SIZE.width),
  });
});

test("comp transfer preserves drawings and roles and restores map and formation together", () => {
  const note: BoardDrawing = {
    id: "note",
    kind: "note",
    x: 30,
    y: 40,
    color: "#ffd166",
    text: "Rotate",
    width: NOTE_SIZE.width,
  };
  const session = new BoardSession(measureNote, {
    ...initial,
    drawingsByMap: { [DEFAULT_MAP_ID]: [note] },
  });
  const museum = builtin(MUSEUM);
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
  const transferred = session.openComp({ comp, mapId: MUSEUM });
  expect(transferred.board.tokens).toEqual([
    {
      id: "ally-deadpool",
      heroId: "deadpool",
      team: "ally",
      deadpoolRole: "Duelist",
      ...compSlot(museum, "ally", 0, DEFAULT_ICON_SIZE),
    },
    {
      id: "ally-luna",
      heroId: "luna",
      team: "ally",
      ...compSlot(museum, "ally", 2, DEFAULT_ICON_SIZE),
    },
    {
      id: "enemy-magneto",
      heroId: "magneto",
      team: "enemy",
      ...compSlot(museum, "enemy", 0, DEFAULT_ICON_SIZE),
    },
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
    mapId: MUSEUM,
  });
  expect(changed.board.tokens[0]?.deadpoolRole).toBe("Strategist");
  expect(session.undo()).toMatchObject({
    board: transferred.board,
    canRedo: true,
  });
  expect(session.redo().board).toEqual(changed.board);
});

test("icon size changes visible bounds without a history edit", () => {
  const small = tokenBoundary(50);
  const large = tokenBoundary(150);
  const session = new BoardSession(
    measureNote,
    { ...initial, tokens: [{ ...strange, x: small, y: small }] },
    50,
  );
  const larger = session.setIconSize(150);
  expect(larger.canUndo).toBe(false);
  expect(larger.board.tokens[0]).toMatchObject({ x: small, y: small });
  expect(larger.tokens[0]).toMatchObject({ x: large, y: large });
  const smaller = session.setIconSize(50);
  expect(smaller.board.tokens[0]).toMatchObject({ x: small, y: small });
  expect(smaller.tokens[0]).toMatchObject({ x: small, y: small });
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
  const boundary = tokenBoundary(150);
  const session = new BoardSession(
    measureNote,
    { ...initial, tokens: [{ ...strange, x: 0, y: 0 }] },
    150,
  );
  let notified = 0;
  const unsubscribe = session.subscribe(() => {
    notified += 1;
  });
  const first = session.getSnapshot();
  expect(session.getSnapshot()).toBe(first);
  expect(first.tokens).toEqual([{ ...strange, x: boundary, y: boundary }]);
  session.removeToken("missing");
  session.setIconSize(150);
  session.undo();
  expect(session.getSnapshot()).toBe(first);
  expect(notified).toBe(0);

  const target = onBoard(session, { x: 300, y: 400 });
  session.moveToken({ id: strange.id, point: target });
  const moved = session.getSnapshot();
  expect(moved).not.toBe(first);
  expect(session.getSnapshot()).toBe(moved);
  expect(moved.tokens).toEqual([{ ...strange, x: target.x, y: target.y }]);
  expect(notified).toBe(1);

  session.setIconSize(50);
  expect(session.getSnapshot()).not.toBe(moved);
  expect(session.getSnapshot().boardRevision).toBe(moved.boardRevision);
  expect(notified).toBe(2);

  unsubscribe();
  session.undo();
  expect(session.getSnapshot().board.tokens).toEqual([
    { ...strange, x: 0, y: 0 },
  ]);
  expect(notified).toBe(2);
});
