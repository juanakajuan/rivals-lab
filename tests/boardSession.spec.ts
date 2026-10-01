import { expect, test } from "@playwright/test";
import { BoardSession, type BoardState } from "../src/boardSession";
import type { BoardDrawing } from "../src/boardDrawings";
import { emptyComp } from "../src/comps";
import { DEFAULT_MAP_ID } from "../src/maps";

const initial: BoardState = {
  mapId: DEFAULT_MAP_ID,
  tokens: [
    { id: "ally-strange", heroId: "strange", team: "ally", x: 270, y: 435 },
  ],
  drawingsByMap: {},
};

test("map changes and position bounds form one reversible edit", () => {
  const session = new BoardSession({
    ...initial,
    tokens: [
      { id: "ally-strange", heroId: "strange", team: "ally", x: 270, y: 635 },
    ],
  });
  const original = session.state;
  const changed = session.changeMap({
    mapId: "museum-of-contemplation-convoy",
    iconSize: 150,
  });
  expect(changed).toEqual({
    mapId: "museum-of-contemplation-convoy",
    tokens: [
      { id: "ally-strange", heroId: "strange", team: "ally", x: 270, y: 622 },
    ],
    drawingsByMap: {},
    canUndo: true,
    canRedo: false,
  });
  expect(session.clear().tokens).toEqual([]);
  expect(session.undo()).toEqual({ ...changed, canRedo: true });
  expect(session.undo()).toEqual({ ...original, canRedo: true });
  const atStart = session.state;
  expect(session.undo()).toBe(atStart);
  expect(session.redo()).toEqual({ ...changed, canRedo: true });
  expect(session.redo().tokens).toEqual([]);
  expect(session.state.canRedo).toBe(false);
  const atEnd = session.state;
  expect(session.redo()).toBe(atEnd);
});

test("unchanged edits retain the state reference and redo; a new edit clears redo", () => {
  const session = new BoardSession(initial);
  session.clear();
  const restored = session.undo();
  expect(restored.canRedo).toBe(true);
  expect(
    session.moveToken({ id: "ally-strange", point: { x: 270, y: 435 } }),
  ).toBe(restored);
  expect(session.moveToken({ id: "missing", point: { x: 400, y: 400 } })).toBe(
    restored,
  );
  expect(session.removeToken("missing")).toBe(restored);
  expect(session.removeDrawing("missing")).toBe(restored);
  expect(
    session.moveDrawing({ id: "missing", delta: { x: 10, y: 0 } }),
  ).toBeNull();
  expect(session.changeMap({ mapId: DEFAULT_MAP_ID, iconSize: 100 })).toBe(
    restored,
  );
  expect(
    session.addHero({ heroId: "strange", team: "ally", iconSize: 150 }),
  ).toEqual({ kind: "existing" });
  session.placeHero({
    heroId: "strange",
    team: "ally",
    point: { x: 270, y: 435 },
    iconSize: 100,
  });
  expect(session.state).toBe(restored);
  session.removeToken("ally-strange");
  const edited = session.state;
  expect(edited.canRedo).toBe(false);
  expect(session.clear()).toBe(edited);
  expect(session.redo()).toBe(edited);
  expect(session.undo().tokens).toEqual(initial.tokens);
  const defaults = new BoardSession();
  const unchanged = defaults.state;
  expect(defaults.reset()).toBe(unchanged);
});

test("history retains the last 100 edits in order and supports branching", () => {
  const session = new BoardSession(initial);
  for (let x = 300; x <= 404; x++) {
    session.moveToken({ id: "ally-strange", point: { x, y: 435 } });
  }
  for (let x = 403; x >= 304; x--) {
    expect(session.undo().tokens[0]?.x).toBe(x);
  }
  expect(session.state.canUndo).toBe(false);
  const oldest = session.state;
  expect(session.undo()).toBe(oldest);
  expect(
    session.moveToken({ id: "ally-strange", point: { x: 304, y: 435 } }),
  ).toBe(oldest);
  for (let x = 305; x <= 404; x++) {
    expect(session.redo().tokens[0]?.x).toBe(x);
  }
  expect(session.state.canRedo).toBe(false);
  session.undo();
  session.removeToken("ally-strange");
  expect(session.state.canRedo).toBe(false);
  expect(session.redo().tokens).toEqual([]);
  expect(session.undo().tokens[0]?.x).toBe(403);
});

test("placement bounds, team identity, and free positions use the supplied icon size", () => {
  const session = new BoardSession({ ...initial, tokens: [] });
  expect(
    session.placeHero({
      heroId: "angela",
      team: "ally",
      point: { x: -10, y: 999 },
      iconSize: 150,
    }),
  ).toEqual({
    kind: "added",
    token: { id: "ally-angela", heroId: "angela", team: "ally", x: 36, y: 618 },
  });
  expect(
    session.addHero({ heroId: "angela", team: "enemy", iconSize: 100 }),
  ).toEqual({
    kind: "added",
    token: {
      id: "enemy-angela",
      heroId: "angela",
      team: "enemy",
      x: 652,
      y: 52,
    },
  });
  expect(
    session.addHero({ heroId: "strange", team: "ally", iconSize: 150 }),
  ).toEqual({
    kind: "added",
    token: {
      id: "ally-strange",
      heroId: "strange",
      team: "ally",
      x: 76,
      y: 76,
    },
  });
  expect(
    session.placeHero({
      heroId: "angela",
      team: "ally",
      point: { x: 9999, y: -10 },
      iconSize: 100,
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
  expect(session.state.tokens).toHaveLength(3);
  expect(session.undo().tokens[0]).toEqual({
    id: "ally-angela",
    heroId: "angela",
    team: "ally",
    x: 36,
    y: 618,
  });
});

test("free placement uses visible positions, falls back to the other half, and preserves a full board", () => {
  const session = new BoardSession({
    ...initial,
    tokens: [
      { id: "ally-strange", heroId: "strange", team: "ally", x: 0, y: 0 },
    ],
  });
  expect(
    session.addHero({ heroId: "angela", team: "ally", iconSize: 150 }),
  ).toMatchObject({ token: { x: 152, y: 76 } });

  const occupied = new BoardSession({
    ...initial,
    tokens: [
      { id: "enemy-strange", heroId: "strange", team: "enemy", x: 292, y: 292 },
      { id: "enemy-angela", heroId: "angela", team: "enemy", x: 892, y: 292 },
    ],
  });
  const full = occupied.state;
  expect(
    occupied.addHero({ heroId: "luna", team: "ally", iconSize: 600 }),
  ).toEqual({ kind: "full" });
  expect(occupied.state).toBe(full);
  occupied.removeToken("enemy-angela");
  expect(
    occupied.addHero({ heroId: "luna", team: "ally", iconSize: 600 }),
  ).toMatchObject({ token: { x: 892, y: 292 } });
});

test("drawings remain isolated by map through edit, clear, reset, and history", () => {
  const session = new BoardSession(initial);
  const note: BoardDrawing = {
    id: "note",
    kind: "note",
    x: 30,
    y: 40,
    color: "#ffd166",
    text: "Rotate",
  };
  session.editDrawing(note);
  const withNote = session.state;
  expect(session.editDrawing({ ...note })).toBe(withNote);
  expect(
    session.moveDrawing({ id: "note", delta: { x: -10, y: 9999 } }),
  ).toEqual({ ...note, x: 20, y: 584 });
  expect(session.undo().drawingsByMap[DEFAULT_MAP_ID]).toEqual([note]);
  session.changeMap({ mapId: "hells-heaven-domination", iconSize: 100 });
  const arrow = session.addDrawing({ kind: "arrow", color: "#ff6268" });
  expect(arrow).toMatchObject({
    kind: "arrow",
    x: 520,
    y: 288.5,
    dx: 160,
    dy: 80,
    color: "#ff6268",
  });
  expect(session.clear().drawingsByMap).toEqual({
    [DEFAULT_MAP_ID]: [note],
    "hells-heaven-domination": [],
  });
  expect(session.undo().drawingsByMap["hells-heaven-domination"]).toEqual([
    arrow,
  ]);
  expect(session.reset().drawingsByMap).toEqual({
    [DEFAULT_MAP_ID]: [note],
    "hells-heaven-domination": [],
  });
  expect(session.undo().drawingsByMap["hells-heaven-domination"]).toEqual([
    arrow,
  ]);
  session.removeDrawing(arrow.id);
  expect(session.state.drawingsByMap["hells-heaven-domination"]).toEqual([]);
  expect(session.undo().drawingsByMap["hells-heaven-domination"]).toEqual([
    arrow,
  ]);
});

test("comp transfer preserves drawings and roles and restores map and formation together", () => {
  const note: BoardDrawing = {
    id: "note",
    kind: "note",
    x: 30,
    y: 40,
    color: "#ffd166",
    text: "Rotate",
  };
  const session = new BoardSession({
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
    mapId: "museum-of-contemplation-convoy",
  });
  expect(transferred.tokens).toEqual([
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
  expect(transferred.drawingsByMap).toEqual({ [DEFAULT_MAP_ID]: [note] });
  expect(session.undo()).toMatchObject({
    ...initial,
    drawingsByMap: { [DEFAULT_MAP_ID]: [note] },
    canUndo: false,
    canRedo: true,
  });
  expect(session.redo()).toEqual(transferred);
  const changed = session.openComp({
    comp: {
      ...comp,
      teams: {
        ...comp.teams,
        ally: [{ heroId: "deadpool", deadpoolRole: "Strategist", notes: "" }],
      },
    },
    mapId: "museum-of-contemplation-convoy",
  });
  expect(changed.tokens[0]?.deadpoolRole).toBe("Strategist");
  expect(session.undo()).toEqual({ ...transferred, canRedo: true });
  expect(session.redo()).toEqual(changed);
});
