import {
  MAX_DRAWINGS_PER_MAP,
  createDrawing,
  equalDrawings,
  moveDrawing,
  type BoardDrawing,
  type MapPoint,
  type MeasureBoardNote,
} from "./boardDrawings";
import {
  DEFAULT_ICON_SIZE,
  boardTokenId,
  clampToBoard,
  tokenBoundary,
  type BoardPoint,
  type BoardToken,
  type IconSize,
} from "./boardTokens";
import type { Comp } from "./comps";
import { TEAMS, TEAM_SIZE, type Team } from "./heroes";
import { DEFAULT_MAP_ID, type BuiltinBoardMapId } from "./maps";

import {
  resolveBoardMap,
  type BoardMapId,
  type CustomBoardMap,
  type SelectedBoardMap,
} from "./boardMaps";

export interface BoardState {
  readonly map: SelectedBoardMap;
  readonly tokens: readonly BoardToken[];
  readonly drawingsByMap: Readonly<
    Partial<Record<BoardMapId, readonly BoardDrawing[]>>
  >;
}

export interface BoardSnapshot {
  readonly board: BoardState;
  readonly tokens: readonly BoardToken[];
  readonly boardRevision: number;
  readonly iconSize: IconSize;
  readonly customMaps: readonly CustomBoardMap[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface HeroPlacement {
  readonly kind: "added" | "moved";
  readonly token: BoardToken;
}

export type HeroPlaceResult = HeroPlacement | { readonly kind: "team-full" };
export type HeroAddResult =
  HeroPlaceResult | { readonly kind: "existing" | "full" };

export function keepEarliestTeamPlacements(board: BoardState): BoardState {
  const counts: Record<Team, number> = { ally: 0, enemy: 0 };
  const tokens = board.tokens.filter(
    (token) => ++counts[token.team] <= TEAM_SIZE,
  );
  return tokens.length === board.tokens.length ? board : { ...board, tokens };
}

const HISTORY_LIMIT = 100;

const INITIAL_PLACEMENTS: Readonly<
  Record<Team, readonly Pick<BoardToken, "heroId" | "x" | "y">[]>
> = {
  ally: [
    { heroId: "strange", x: 270, y: 435 },
    { heroId: "psylocke", x: 380, y: 350 },
    { heroId: "luna", x: 230, y: 520 },
  ],
  enemy: [
    { heroId: "magneto", x: 865, y: 310 },
    { heroId: "magik", x: 960, y: 410 },
    { heroId: "rocket", x: 910, y: 515 },
  ],
};

const TEAM_HALF_START: Readonly<Record<Team, number>> = { ally: 0, enemy: 0.5 };

function initialTokens(): BoardToken[] {
  return TEAMS.flatMap((team) =>
    INITIAL_PLACEMENTS[team].map(({ heroId, x, y }) => ({
      id: boardTokenId(team, heroId),
      heroId,
      team,
      x,
      y,
    })),
  );
}

export function initialBoard(): BoardState {
  return {
    map: { kind: "builtin", id: DEFAULT_MAP_ID },
    tokens: initialTokens(),
    drawingsByMap: {},
  };
}

function clampTokens(board: BoardState, iconSize: number): BoardState {
  const map = resolveBoardMap(board.map);
  let moved = false;
  const tokens = board.tokens.map((token) => {
    const { x, y } = clampToBoard(token, map, iconSize);
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
  private current: BoardSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly measureNote: MeasureBoardNote,
    board: BoardState = initialBoard(),
    iconSize: IconSize = DEFAULT_ICON_SIZE,
    customMaps: readonly CustomBoardMap[] = [],
  ) {
    this.current = {
      board,
      tokens: clampTokens(board, iconSize).tokens,
      boardRevision: 0,
      iconSize,
      customMaps,
      canUndo: false,
      canRedo: false,
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): BoardSnapshot => this.current;

  private get board(): BoardState {
    return this.current.board;
  }

  private get iconSize(): IconSize {
    return this.current.iconSize;
  }

  placeHero({
    heroId,
    team,
    point,
  }: {
    readonly heroId: string;
    readonly team: Team;
    readonly point: BoardPoint;
  }): HeroPlaceResult {
    const id = boardTokenId(team, heroId);
    const existing = this.board.tokens.find((token) => token.id === id);
    if (!existing && this.isTeamFull(team)) return { kind: "team-full" };
    const token: BoardToken = {
      ...(existing ?? { id, heroId, team }),
      x: point.x,
      y: point.y,
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
    if (this.isTeamFull(team)) return { kind: "team-full" };
    const map = resolveBoardMap(this.board.map);
    const boundary = tokenBoundary(this.iconSize);
    const spacing = boundary * 2 + 4;
    const halfWidth = Math.floor(map.width / 2);
    const preferredStart = Math.floor(map.width * TEAM_HALF_START[team]);
    for (const startX of [preferredStart, halfWidth - preferredStart]) {
      for (let y = spacing; y <= map.height - boundary; y += spacing) {
        for (
          let x = startX + spacing;
          x <= startX + halfWidth - boundary;
          x += spacing
        ) {
          if (
            this.current.tokens.some(
              (token) =>
                Math.abs(token.x - x) < spacing &&
                Math.abs(token.y - y) < spacing,
            )
          )
            continue;
          return this.placeHero({
            heroId,
            team,
            point: clampToBoard({ x, y }, map, this.iconSize),
          });
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
  }): BoardSnapshot {
    return this.commit({
      ...this.board,
      tokens: this.board.tokens.map((token) =>
        token.id === id ? { ...token, x: point.x, y: point.y } : token,
      ),
    });
  }

  removeToken(id: string): BoardSnapshot {
    return this.commit({
      ...this.board,
      tokens: this.board.tokens.filter((token) => token.id !== id),
    });
  }

  editDrawing(drawing: BoardDrawing): BoardSnapshot {
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
    readonly delta: MapPoint;
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

  removeDrawing(id: string): BoardSnapshot {
    return this.commitDrawings(
      (this.board.drawingsByMap[this.board.map.id] ?? []).filter(
        (drawing) => drawing.id !== id,
      ),
    );
  }

  clear(): BoardSnapshot {
    return this.commit({
      ...this.board,
      tokens: [],
      drawingsByMap: { ...this.board.drawingsByMap, [this.board.map.id]: [] },
    });
  }

  reset(): BoardSnapshot {
    const map = resolveBoardMap(this.board.map);
    return this.commit({
      ...this.board,
      tokens: initialTokens().map((token) => ({
        ...token,
        ...clampToBoard(token, map, this.iconSize),
      })),
      drawingsByMap: { ...this.board.drawingsByMap, [this.board.map.id]: [] },
    });
  }

  setIconSize(iconSize: IconSize): BoardSnapshot {
    if (iconSize === this.iconSize) return this.current;
    return this.publish({
      ...this.current,
      tokens: clampTokens(this.board, iconSize).tokens,
      iconSize,
    });
  }

  addCustomMap(map: CustomBoardMap): BoardSnapshot {
    return this.publish({
      ...this.current,
      customMaps: [...this.current.customMaps, map],
    });
  }

  changeMap(map: SelectedBoardMap): BoardSnapshot {
    const dimensions = resolveBoardMap(map);
    return this.commit({
      ...this.board,
      map,
      tokens: this.board.tokens.map((token) => ({
        ...token,
        ...clampToBoard(token, dimensions, this.iconSize),
      })),
    });
  }

  openComp({
    comp,
    mapId,
  }: {
    readonly comp: Comp;
    readonly mapId: BuiltinBoardMapId;
  }): BoardSnapshot {
    const map = resolveBoardMap({ kind: "builtin", id: mapId });
    const tokens: BoardToken[] = [];
    for (const team of TEAMS) {
      comp.teams[team].forEach((slot, index) => {
        if (!slot.heroId) return;
        tokens.push({
          id: boardTokenId(team, slot.heroId),
          heroId: slot.heroId,
          team,
          ...(slot.deadpoolRole ? { deadpoolRole: slot.deadpoolRole } : {}),
          ...clampToBoard(
            {
              x:
                map.width * (TEAM_HALF_START[team] + 0.25) +
                (index % 2) * 65 -
                32,
              y: map.height * 0.3 + Math.floor(index / 2) * 80,
            },
            map,
            this.iconSize,
          ),
        });
      });
    }
    return this.commit({
      ...this.board,
      map: { kind: "builtin", id: mapId },
      tokens,
    });
  }

  undo(): BoardSnapshot {
    const board = this.past.at(-1);
    if (!board) return this.current;
    this.past = this.past.slice(0, -1);
    this.future = [this.board, ...this.future];
    return this.restore(board);
  }

  redo(): BoardSnapshot {
    const board = this.future[0];
    if (!board) return this.current;
    this.past = [...this.past, this.board].slice(-HISTORY_LIMIT);
    this.future = this.future.slice(1);
    return this.restore(board);
  }

  private commitDrawings(drawings: readonly BoardDrawing[]): BoardSnapshot {
    return this.commit({
      ...this.board,
      drawingsByMap: {
        ...this.board.drawingsByMap,
        [this.board.map.id]: drawings,
      },
    });
  }

  private isTeamFull(team: Team): boolean {
    return (
      this.board.tokens.filter((token) => token.team === team).length >=
      TEAM_SIZE
    );
  }

  private commit(board: BoardState): BoardSnapshot {
    board = keepEarliestTeamPlacements(board);
    if (equalBoards(this.board, board)) return this.current;
    this.past = [...this.past, this.board].slice(-HISTORY_LIMIT);
    this.future = [];
    return this.restore(board);
  }

  private restore(board: BoardState): BoardSnapshot {
    return this.publish({
      ...this.current,
      board,
      tokens: clampTokens(board, this.iconSize).tokens,
      boardRevision: this.current.boardRevision + 1,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    });
  }

  private publish(snapshot: BoardSnapshot): BoardSnapshot {
    this.current = snapshot;
    for (const listener of this.listeners) listener();
    return snapshot;
  }
}
