import {
  MAX_DRAWINGS_PER_MAP,
  decodeDrawing,
  drawingLimitMessage,
  type BoardDrawing,
} from "./boardDrawings";
import {
  decodeCustomMap,
  type BoardMapId,
  type CustomBoardMap,
  type SelectedBoardMap,
} from "./boardMaps";
import { initialBoard, type BoardState } from "./boardSession";
import {
  DEFAULT_ICON_SIZE,
  decodeToken,
  parseIconSize,
  type BoardToken,
  type IconSize,
} from "./boardTokens";
import {
  decodeCompLibrary,
  serializeCompLibrary,
  type CompLibrary,
} from "./comps";
import { TEAM_SIZE } from "./heroes";
import { MAPS } from "./maps";
import {
  decodeOpenCompSnapshot,
  emptyOpenComp,
  type OpenCompSnapshot,
} from "./savedComps";

export interface Workspace {
  readonly board: BoardState;
  readonly customMaps: readonly CustomBoardMap[];
  readonly iconSize: IconSize;
  readonly openComp: OpenCompSnapshot;
}

export interface BoardRecord {
  readonly mapId: BoardMapId;
  readonly tokens: readonly BoardToken[];
  readonly drawingsByMap: BoardState["drawingsByMap"];
  readonly iconSize: IconSize;
}

export interface StoredRecords {
  readonly library: string | null;
  readonly board: unknown;
  readonly openComp: unknown;
  readonly customMaps: readonly unknown[];
}

export const EMPTY_STORED_RECORDS: StoredRecords = {
  library: null,
  board: undefined,
  openComp: undefined,
  customMaps: [],
};

const MAX_BOARD_TOKENS = 200;

const EMPTY_LIBRARY: CompLibrary = {
  entries: [],
  unavailable: [],
  errors: [],
  envelope: { version: 1, comps: [] },
};

export function decodeBoardRecord(
  value: unknown,
  customMaps: readonly CustomBoardMap[],
  allowLegacyTeams = false,
): { readonly board: BoardState; readonly iconSize: IconSize } {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid Position Board.");
  const record: Partial<Record<string, unknown>> = value;
  const maps = new Map<string, SelectedBoardMap>([
    ...MAPS.map(({ id }) => [id, { kind: "builtin", id }] as const),
    ...customMaps.map((map) => [map.id, map] as const),
  ]);
  const map = typeof record.mapId === "string" && maps.get(record.mapId);
  if (!map) throw new Error("The Position Board map is missing.");
  if (!Array.isArray(record.tokens) || record.tokens.length > MAX_BOARD_TOKENS)
    throw new Error("Invalid hero token list.");
  const tokens = record.tokens.map(decodeToken);
  if (new Set(tokens.map((token) => token.id)).size !== tokens.length)
    throw new Error("A hero appears twice on the Position Board.");
  if (
    !allowLegacyTeams &&
    ["ally", "enemy"].some(
      (team) =>
        tokens.filter((token) => token.team === team).length > TEAM_SIZE,
    )
  )
    throw new Error(
      `Position Board teams cannot exceed ${TEAM_SIZE} heroes. Remove extra heroes before importing this backup.`,
    );
  const drawings = record.drawingsByMap;
  if (
    typeof drawings !== "object" ||
    drawings === null ||
    Array.isArray(drawings)
  )
    throw new Error("Invalid board drawings.");
  const drawingsByMap: Partial<Record<BoardMapId, readonly BoardDrawing[]>> =
    {};
  for (const [mapId, list] of Object.entries(drawings)) {
    const owner = maps.get(mapId);
    if (!owner) throw new Error("Board drawings belong to a missing map.");
    if (!Array.isArray(list)) throw new Error("Invalid board drawings.");
    if (list.length > MAX_DRAWINGS_PER_MAP)
      throw new Error(drawingLimitMessage());
    const decoded = list.map(decodeDrawing);
    if (new Set(decoded.map((drawing) => drawing.id)).size !== decoded.length)
      throw new Error("A drawing ID appears twice on one map.");
    drawingsByMap[owner.id] = decoded;
  }
  return {
    board: { map, tokens, drawingsByMap },
    iconSize: parseIconSize(record.iconSize),
  };
}

export function encodeBoardRecord(
  board: BoardState,
  iconSize: IconSize,
): BoardRecord {
  return {
    mapId: board.map.id,
    tokens: board.tokens,
    drawingsByMap: board.drawingsByMap,
    iconSize,
  };
}

function lenient<T>(decode: () => T, fallback: () => T): T {
  try {
    return decode();
  } catch {
    return fallback();
  }
}

/** Decode what this browser saved. A damaged record falls back to its empty state. */
export function decodeStoredRecords(records: StoredRecords): {
  readonly workspace: Workspace;
  readonly library: CompLibrary;
} {
  const customMaps = records.customMaps.flatMap((value) =>
    lenient(
      () => [decodeCustomMap(value)],
      () => [],
    ),
  );
  const { board, iconSize } = lenient(
    () => decodeBoardRecord(records.board, customMaps, true),
    () => ({ board: initialBoard(), iconSize: DEFAULT_ICON_SIZE }),
  );
  return {
    workspace: {
      board,
      customMaps,
      iconSize,
      openComp: lenient(
        () => decodeOpenCompSnapshot(records.openComp),
        emptyOpenComp,
      ),
    },
    library: lenient(
      () => decodeCompLibrary(records.library ?? serializeCompLibrary([])),
      () => EMPTY_LIBRARY,
    ),
  };
}
