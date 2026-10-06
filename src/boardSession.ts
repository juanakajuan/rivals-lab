import {
  createDrawing,
  equalDrawings,
  moveDrawing,
  type BoardDrawing,
  type BoardPoint,
  type MeasureBoardNote,
} from "./boardDrawings";
import { clampToBoard, tokenBoundary, type BoardToken } from "./boardTokens";
import type { Comp } from "./comps";
import type { Team } from "./heroes";
import { DEFAULT_MAP_ID, getMap, type MapId } from "./maps";

import {
  resolveBoardMap,
  type BoardMapId,
  type SelectedBoardMap,
} from "./boardMaps";

export interface BoardState {
  readonly map: SelectedBoardMap;
  readonly tokens: readonly BoardToken[];
  readonly drawingsByMap: Readonly<
    Partial<Record<BoardMapId, readonly BoardDrawing[]>>
  >;
}

export interface BoardSessionState extends BoardState {
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
    { id: "ally-strange", heroId: "strange", team: "ally", x: 270, y: 435 },
    { id: "ally-psylocke", heroId: "psylocke", team: "ally", x: 380, y: 350 },
    { id: "ally-luna", heroId: "luna", team: "ally", x: 230, y: 520 },
    { id: "enemy-magneto", heroId: "magneto", team: "enemy", x: 865, y: 310 },
    { id: "enemy-magik", heroId: "magik", team: "enemy", x: 960, y: 410 },
    { id: "enemy-rocket", heroId: "rocket", team: "enemy", x: 910, y: 515 },
  ];
}

export function initialBoard(): BoardState {
  return {
    map: { kind: "builtin", id: DEFAULT_MAP_ID },
    tokens: initialTokens(),
    drawingsByMap: {},
  };
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
  private board: BoardState;
  private current: BoardSessionState;

  constructor(
    private readonly measureNote: MeasureBoardNote,
    board: BoardState = initialBoard(),
  ) {
    this.board = board;
    this.current = { ...board, canUndo: false, canRedo: false };
  }

  get state(): BoardSessionState {
    return this.current;
  }

  placeHero({
    heroId,
    team,
    point,
    iconSize,
  }: {
    readonly heroId: string;
    readonly team: Team;
    readonly point: BoardPoint;
    readonly iconSize: number;
  }): HeroPlacement {
    const map = resolveBoardMap(this.board.map);
    const id = `${team}-${heroId}`;
    const existing = this.board.tokens.find((token) => token.id === id);
    const token: BoardToken = {
      ...(existing ?? { id, heroId, team }),
      x: clampToBoard(point.x, map.width, iconSize),
      y: clampToBoard(point.y, map.height, iconSize),
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
    iconSize,
  }: {
    readonly heroId: string;
    readonly team: Team;
    readonly iconSize: number;
  }): HeroAddResult {
    if (this.board.tokens.some((token) => token.id === `${team}-${heroId}`))
      return { kind: "existing" };
    const map = resolveBoardMap(this.board.map);
    const boundary = tokenBoundary(iconSize);
    const spacing = boundary * 2 + 4;
    const halfWidth = Math.floor(map.width / 2);
    const preferredStart = team === "ally" ? 0 : halfWidth;
    const tokens = this.board.tokens.map((token) => ({
      x: clampToBoard(token.x, map.width, iconSize),
      y: clampToBoard(token.y, map.height, iconSize),
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
          return this.placeHero({ heroId, team, point: { x, y }, iconSize });
        }
      }
    }
    return { kind: "full" };
  }

  // Canvas gestures supply their final bounded board coordinates.
  moveToken({
    id,
    point,
  }: {
    readonly id: string;
    readonly point: BoardPoint;
  }): BoardSessionState {
    return this.commit({
      ...this.board,
      tokens: this.board.tokens.map((token) =>
        token.id === id ? { ...token, ...point } : token,
      ),
    });
  }

  removeToken(id: string): BoardSessionState {
    return this.commit({
      ...this.board,
      tokens: this.board.tokens.filter((token) => token.id !== id),
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
    return this.commitDrawings(
      drawings.some((item) => item.id === drawing.id)
        ? drawings.map((item) => (item.id === drawing.id ? bounded : item))
        : [...drawings, bounded],
    );
  }

  addDrawing({
    kind,
    color,
  }: {
    readonly kind: BoardDrawing["kind"];
    readonly color: string;
  }): BoardDrawing {
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
    this.editDrawing(drawing);
    return drawing;
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
      drawingsByMap: { ...this.board.drawingsByMap, [this.board.map.id]: [] },
    });
  }

  reset(iconSize = 100): BoardSessionState {
    const map = resolveBoardMap(this.board.map);
    return this.commit({
      ...this.board,
      tokens: initialTokens().map((token) => ({
        ...token,
        x: clampToBoard(token.x, map.width, iconSize),
        y: clampToBoard(token.y, map.height, iconSize),
      })),
      drawingsByMap: { ...this.board.drawingsByMap, [this.board.map.id]: [] },
    });
  }

  changeMap({
    map,
    iconSize,
  }: {
    readonly map: SelectedBoardMap;
    readonly iconSize: number;
  }): BoardSessionState {
    const dimensions = resolveBoardMap(map);
    return this.commit({
      ...this.board,
      map,
      tokens: this.board.tokens.map((token) => ({
        ...token,
        x: clampToBoard(token.x, dimensions.width, iconSize),
        y: clampToBoard(token.y, dimensions.height, iconSize),
      })),
    });
  }

  openComp({
    comp,
    mapId,
  }: {
    readonly comp: Comp;
    readonly mapId: MapId;
  }): BoardSessionState {
    const map = getMap(mapId);
    const tokens: BoardToken[] = [];
    const teams: readonly Team[] = ["ally", "enemy"];
    for (const team of teams) {
      comp.teams[team].forEach((slot, index) => {
        if (!slot.heroId) return;
        tokens.push({
          id: `${team}-${slot.heroId}`,
          heroId: slot.heroId,
          team,
          ...(slot.deadpoolRole ? { deadpoolRole: slot.deadpoolRole } : {}),
          x: Math.round(
            map.width * (team === "ally" ? 0.25 : 0.75) + (index % 2) * 65 - 32,
          ),
          y: Math.round(map.height * 0.3 + Math.floor(index / 2) * 80),
        });
      });
    }
    return this.commit({
      ...this.board,
      map: { kind: "builtin", id: mapId },
      tokens,
    });
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
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    };
    return this.current;
  }
}
