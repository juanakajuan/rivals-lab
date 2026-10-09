import {
  MAX_DRAWINGS_PER_MAP,
  createDrawing,
  equalDrawings,
  moveDrawing,
  type BoardDrawing,
  type BoardPoint,
  type MeasureBoardNote,
} from "./boardDrawings";
import {
  DEFAULT_ICON_SIZE,
  boardTokenId,
  clampToBoard,
  tokenBoundary,
  type BoardToken,
  type IconSize,
} from "./boardTokens";
import type { Comp } from "./comps";
import type { Team } from "./heroes";
import { DEFAULT_MAP_ID, type GameMode, type MapId } from "./maps";

import {
  resolveBoardMap,
  type BoardMapId,
  type SelectedBoardMap,
} from "./boardMaps";

/** Saved hero positions of one map, by token ID. */
export type MapPositions = Readonly<Record<string, BoardPoint>>;

export interface BoardState {
  /** The active map. Under a game mode it only supplies board geometry. */
  readonly map: SelectedBoardMap;
  /** Map tabs. Empty when a game mode is selected. Otherwise includes `map`. */
  readonly maps: readonly SelectedBoardMap[];
  readonly mode: GameMode | null;
  /** Hero tokens, positioned for the active map. The hero list is shared by all maps. */
  readonly tokens: readonly BoardToken[];
  /** Positions of the other selected maps. The active map's positions are in `tokens`. */
  readonly positionsByMap: Readonly<Partial<Record<BoardMapId, MapPositions>>>;
  readonly drawingsByMap: Readonly<
    Partial<Record<BoardMapId, readonly BoardDrawing[]>>
  >;
}

export interface BoardSessionState extends BoardState {
  readonly iconSize: IconSize;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface HeroPlacement {
  readonly kind: "added" | "moved";
  readonly token: BoardToken;
}

export type HeroAddResult =
  HeroPlacement | { readonly kind: "existing" | "full" };

const HISTORY_LIMIT = 100;

function initialTokens(): BoardToken[] {
  return [
    {
      id: boardTokenId("ally", "strange"),
      heroId: "strange",
      team: "ally",
      x: 270,
      y: 435,
    },
    {
      id: boardTokenId("ally", "psylocke"),
      heroId: "psylocke",
      team: "ally",
      x: 380,
      y: 350,
    },
    {
      id: boardTokenId("ally", "luna"),
      heroId: "luna",
      team: "ally",
      x: 230,
      y: 520,
    },
    {
      id: boardTokenId("enemy", "magneto"),
      heroId: "magneto",
      team: "enemy",
      x: 865,
      y: 310,
    },
    {
      id: boardTokenId("enemy", "magik"),
      heroId: "magik",
      team: "enemy",
      x: 960,
      y: 410,
    },
    {
      id: boardTokenId("enemy", "rocket"),
      heroId: "rocket",
      team: "enemy",
      x: 910,
      y: 515,
    },
  ];
}

export function initialBoard(): BoardState {
  return {
    ...mapsSelection([{ kind: "builtin", id: DEFAULT_MAP_ID }]),
    tokens: initialTokens(),
    positionsByMap: {},
    drawingsByMap: {},
  };
}

function mapsSelection(
  maps: readonly [SelectedBoardMap, ...SelectedBoardMap[]],
): Pick<BoardState, "map" | "maps" | "mode"> {
  return { map: maps[0], maps, mode: null };
}

function equalPositions(
  left: BoardState["positionsByMap"],
  right: BoardState["positionsByMap"],
): boolean {
  const leftEntries = new Map<string, MapPositions | undefined>(
    Object.entries(left),
  );
  const rightEntries = new Map<string, MapPositions | undefined>(
    Object.entries(right),
  );
  const ids = new Set([...leftEntries.keys(), ...rightEntries.keys()]);
  return [...ids].every((id) => {
    const a = leftEntries.get(id) ?? {};
    const b = rightEntries.get(id) ?? {};
    const tokenIds = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...tokenIds].every(
      (tokenId) =>
        a[tokenId]?.x === b[tokenId]?.x && a[tokenId]?.y === b[tokenId]?.y,
    );
  });
}

/** Make `target` the active map: save the current positions and load the target's. */
function activateMap(
  board: BoardState,
  target: SelectedBoardMap,
  iconSize: number,
): BoardState {
  const dimensions = resolveBoardMap(target);
  const saved: Record<string, MapPositions> = {
    ...board.positionsByMap,
    [board.map.id]: Object.fromEntries(
      board.tokens.map((token) => [token.id, { x: token.x, y: token.y }]),
    ),
  };
  const stored = saved[target.id];
  delete saved[target.id];
  return {
    ...board,
    map: target,
    positionsByMap: saved,
    tokens: board.tokens.map((token) => {
      const point = stored?.[token.id] ?? token;
      return {
        ...token,
        x: clampToBoard(point.x, dimensions.width, iconSize),
        y: clampToBoard(point.y, dimensions.height, iconSize),
      };
    }),
  };
}

/** Drop saved positions of maps that are no longer selected. */
function pruneMapPositions(board: BoardState): BoardState {
  const kept = new Set<string>(board.maps.map((map) => map.id));
  const entries = Object.entries(board.positionsByMap).filter(([id]) =>
    kept.has(id),
  );
  if (entries.length === Object.keys(board.positionsByMap).length) return board;
  return { ...board, positionsByMap: Object.fromEntries(entries) };
}

function clampTokens(board: BoardState, iconSize: number): BoardState {
  const map = resolveBoardMap(board.map);
  let moved = false;
  const tokens = board.tokens.map((token) => {
    const x = clampToBoard(token.x, map.width, iconSize);
    const y = clampToBoard(token.y, map.height, iconSize);
    if (x === token.x && y === token.y) return token;
    moved = true;
    return { ...token, x, y };
  });
  return moved ? { ...board, tokens } : board;
}

function equalBoards(left: BoardState, right: BoardState): boolean {
  const leftDrawings = new Map(Object.entries(left.drawingsByMap));
  const rightDrawings = new Map(Object.entries(right.drawingsByMap));
  return (
    left.map.id === right.map.id &&
    left.mode === right.mode &&
    left.maps.length === right.maps.length &&
    left.maps.every((map, index) => map.id === right.maps[index]?.id) &&
    equalPositions(left.positionsByMap, right.positionsByMap) &&
    [...leftDrawings.keys(), ...rightDrawings.keys()].every((id) =>
      equalDrawings(leftDrawings.get(id) ?? [], rightDrawings.get(id) ?? []),
    ) &&
    left.tokens.length === right.tokens.length &&
    left.tokens.every((token, index) => {
      const other = right.tokens[index];
      return (
        other !== undefined &&
        token.id === other.id &&
        token.heroId === other.heroId &&
        token.team === other.team &&
        token.deadpoolRole === other.deadpoolRole &&
        token.x === other.x &&
        token.y === other.y
      );
    })
  );
}

export class BoardSession {
  private past: readonly BoardState[] = [];
  private future: readonly BoardState[] = [];
  private board: BoardState;
  private iconSize: IconSize;
  private current: BoardSessionState;

  constructor(
    private readonly measureNote: MeasureBoardNote,
    board: BoardState = initialBoard(),
    iconSize: IconSize = DEFAULT_ICON_SIZE,
  ) {
    this.iconSize = iconSize;
    this.board = board;
    this.current = {
      ...board,
      iconSize,
      canUndo: false,
      canRedo: false,
    };
  }

  get state(): BoardSessionState {
    return this.current;
  }

  /** Stored points stay put. Callers paint this list for the current icon size. */
  visibleTokens(): readonly BoardToken[] {
    return clampTokens(this.board, this.iconSize).tokens;
  }

  placeHero({
    heroId,
    team,
    point,
  }: {
    readonly heroId: string;
    readonly team: Team;
    readonly point: BoardPoint;
  }): HeroPlacement {
    const map = resolveBoardMap(this.board.map);
    const id = boardTokenId(team, heroId);
    const existing = this.board.tokens.find((token) => token.id === id);
    const token: BoardToken = {
      ...(existing ?? { id, heroId, team }),
      x: clampToBoard(point.x, map.width, this.iconSize),
      y: clampToBoard(point.y, map.height, this.iconSize),
    };
    this.commit({
      ...this.board,
      tokens: existing
        ? this.board.tokens.map((item) => (item.id === id ? token : item))
        : [...this.board.tokens, token],
    });
    return { kind: existing ? "moved" : "added", token };
  }

  addHero({
    heroId,
    team,
  }: {
    readonly heroId: string;
    readonly team: Team;
  }): HeroAddResult {
    if (
      this.board.tokens.some((token) => token.id === boardTokenId(team, heroId))
    )
      return { kind: "existing" };
    const map = resolveBoardMap(this.board.map);
    const boundary = tokenBoundary(this.iconSize);
    const spacing = boundary * 2 + 4;
    const halfWidth = Math.floor(map.width / 2);
    const preferredStart = team === "ally" ? 0 : halfWidth;
    const tokens = this.board.tokens.map((token) => ({
      x: clampToBoard(token.x, map.width, this.iconSize),
      y: clampToBoard(token.y, map.height, this.iconSize),
    }));
    for (const startX of [preferredStart, halfWidth - preferredStart]) {
      for (let y = spacing; y <= map.height - boundary; y += spacing) {
        for (
          let x = startX + spacing;
          x <= startX + halfWidth - boundary;
          x += spacing
        ) {
          if (
            tokens.some(
              (token) =>
                Math.abs(token.x - x) < spacing &&
                Math.abs(token.y - y) < spacing,
            )
          )
            continue;
          return this.placeHero({ heroId, team, point: { x, y } });
        }
      }
    }
    return { kind: "full" };
  }

  moveToken({
    id,
    point,
  }: {
    readonly id: string;
    readonly point: BoardPoint;
  }): BoardSessionState {
    const map = resolveBoardMap(this.board.map);
    return this.commit({
      ...this.board,
      tokens: this.board.tokens.map((token) =>
        token.id === id
          ? {
              ...token,
              x: clampToBoard(point.x, map.width, this.iconSize),
              y: clampToBoard(point.y, map.height, this.iconSize),
            }
          : token,
      ),
    });
  }

  removeToken(id: string): BoardSessionState {
    return this.commit({
      ...this.board,
      tokens: this.board.tokens.filter((token) => token.id !== id),
      positionsByMap: Object.fromEntries(
        Object.entries(this.board.positionsByMap).map(([mapId, positions]) => [
          mapId,
          Object.fromEntries(
            Object.entries(positions ?? {}).filter(
              ([tokenId]) => tokenId !== id,
            ),
          ),
        ]),
      ),
    });
  }

  editDrawing(drawing: BoardDrawing): BoardSessionState {
    const drawings = this.board.drawingsByMap[this.board.map.id] ?? [];
    const bounded =
      drawing.kind === "note"
        ? moveDrawing(
            drawing,
            drawing.x,
            drawing.y,
            resolveBoardMap(this.board.map),
            this.measureNote,
          )
        : drawing;
    const exists = drawings.some((item) => item.id === bounded.id);
    if (!exists && drawings.length >= MAX_DRAWINGS_PER_MAP) return this.current;
    return this.commitDrawings(
      exists
        ? drawings.map((item) => (item.id === bounded.id ? bounded : item))
        : [...drawings, bounded],
    );
  }

  addDrawing({
    kind,
    color,
  }: {
    readonly kind: BoardDrawing["kind"];
    readonly color: string;
  }): BoardDrawing | null {
    const map = resolveBoardMap(this.board.map);
    const created = createDrawing(
      kind,
      { x: map.width / 2 - 80, y: map.height / 2 - 40 },
      { x: map.width / 2 + 80, y: map.height / 2 + 40 },
      color,
    );
    const drawing =
      created.kind === "note"
        ? moveDrawing(created, created.x, created.y, map, this.measureNote)
        : created;
    const before = this.current;
    this.editDrawing(drawing);
    return this.current === before ? null : drawing;
  }

  moveDrawing({
    id,
    delta,
  }: {
    readonly id: string;
    readonly delta: BoardPoint;
  }): BoardDrawing | null {
    const drawing = this.board.drawingsByMap[this.board.map.id]?.find(
      (item) => item.id === id,
    );
    if (!drawing) return null;
    const moved = moveDrawing(
      drawing,
      drawing.x + delta.x,
      drawing.y + delta.y,
      resolveBoardMap(this.board.map),
      this.measureNote,
    );
    this.editDrawing(moved);
    return moved;
  }

  removeDrawing(id: string): BoardSessionState {
    return this.commitDrawings(
      (this.board.drawingsByMap[this.board.map.id] ?? []).filter(
        (drawing) => drawing.id !== id,
      ),
    );
  }

  clear(): BoardSessionState {
    return this.commit({
      ...this.board,
      tokens: [],
      positionsByMap: {},
      drawingsByMap: { ...this.board.drawingsByMap, [this.board.map.id]: [] },
    });
  }

  reset(): BoardSessionState {
    const map = resolveBoardMap(this.board.map);
    return this.commit({
      ...this.board,
      tokens: initialTokens().map((token) => ({
        ...token,
        x: clampToBoard(token.x, map.width, this.iconSize),
        y: clampToBoard(token.y, map.height, this.iconSize),
      })),
      positionsByMap: {},
      drawingsByMap: { ...this.board.drawingsByMap, [this.board.map.id]: [] },
    });
  }

  setIconSize(iconSize: IconSize): BoardSessionState {
    if (iconSize === this.iconSize) return this.current;
    this.iconSize = iconSize;
    this.current = {
      ...this.board,
      iconSize,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    };
    return this.current;
  }

  /** Choose one map. */
  changeMap(map: SelectedBoardMap): BoardSessionState {
    return this.selectMaps([map]);
  }

  /** Choose several maps. This clears any game mode. */
  selectMaps(maps: readonly SelectedBoardMap[]): BoardSessionState {
    const unique = maps.filter(
      (map, index) => maps.findIndex((other) => other.id === map.id) === index,
    );
    const [first] = unique;
    if (!first) return this.current;
    const active = unique.find((map) => map.id === this.board.map.id) ?? first;
    const switched =
      active.id === this.board.map.id
        ? this.board
        : activateMap(this.board, active, this.iconSize);
    return this.commit(
      pruneMapPositions({ ...switched, map: active, maps: unique, mode: null }),
    );
  }

  /** Choose a game mode. This clears the selected maps and turns off positions. */
  selectMode(mode: GameMode): BoardSessionState {
    return this.commit(pruneMapPositions({ ...this.board, maps: [], mode }));
  }

  /** Show another selected map tab. */
  setActiveMap(id: BoardMapId): BoardSessionState {
    const target = this.board.maps.find((map) => map.id === id);
    if (!target || target.id === this.board.map.id) return this.current;
    return this.commit(activateMap(this.board, target, this.iconSize));
  }

  openComp({
    comp,
    mapIds,
  }: {
    readonly comp: Comp;
    readonly mapIds: readonly MapId[];
  }): BoardSessionState {
    const builtin = mapIds
      .filter((id, index) => mapIds.indexOf(id) === index)
      .map((id): SelectedBoardMap => ({ kind: "builtin", id }));
    const [first] = builtin;
    const active = comp.gameMode || !first ? this.board.map : first;
    const layout = (map: SelectedBoardMap): BoardToken[] =>
      this.formation(comp, map);
    const others: Record<string, MapPositions> = {};
    if (!comp.gameMode)
      for (const map of builtin.slice(1))
        others[map.id] = Object.fromEntries(
          layout(map).map((token) => [token.id, { x: token.x, y: token.y }]),
        );
    return this.commit({
      ...this.board,
      map: active,
      maps: comp.gameMode ? [] : builtin,
      mode: comp.gameMode,
      tokens: layout(active),
      positionsByMap: others,
    });
  }

  private formation(comp: Comp, selected: SelectedBoardMap): BoardToken[] {
    const map = resolveBoardMap(selected);
    const tokens: BoardToken[] = [];
    const teams: readonly Team[] = ["ally", "enemy"];
    for (const team of teams) {
      comp.teams[team].forEach((slot, index) => {
        if (!slot.heroId) return;
        tokens.push({
          id: boardTokenId(team, slot.heroId),
          heroId: slot.heroId,
          team,
          ...(slot.deadpoolRole ? { deadpoolRole: slot.deadpoolRole } : {}),
          x: clampToBoard(
            Math.round(
              map.width * (team === "ally" ? 0.25 : 0.75) +
                (index % 2) * 65 -
                32,
            ),
            map.width,
            this.iconSize,
          ),
          y: clampToBoard(
            Math.round(map.height * 0.3 + Math.floor(index / 2) * 80),
            map.height,
            this.iconSize,
          ),
        });
      });
    }
    return tokens;
  }

  undo(): BoardSessionState {
    const board = this.past.at(-1);
    if (!board) return this.current;
    this.past = this.past.slice(0, -1);
    this.future = [this.board, ...this.future];
    return this.restore(board);
  }

  redo(): BoardSessionState {
    const board = this.future[0];
    if (!board) return this.current;
    this.past = [...this.past, this.board].slice(-HISTORY_LIMIT);
    this.future = this.future.slice(1);
    return this.restore(board);
  }

  private commitDrawings(drawings: readonly BoardDrawing[]): BoardSessionState {
    return this.commit({
      ...this.board,
      drawingsByMap: {
        ...this.board.drawingsByMap,
        [this.board.map.id]: drawings,
      },
    });
  }

  private commit(board: BoardState): BoardSessionState {
    if (equalBoards(this.board, board)) return this.current;
    this.past = [...this.past, this.board].slice(-HISTORY_LIMIT);
    this.future = [];
    return this.restore(board);
  }

  private restore(board: BoardState): BoardSessionState {
    this.board = board;
    this.current = {
      ...board,
      iconSize: this.iconSize,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    };
    return this.current;
  }
}
