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
import {
  initialBoard,
  keepEarliestTeamPlacements,
  type BoardState,
} from "./boardSession";
import {
  DEFAULT_ICON_SIZE,
  decodeToken,
  parseIconSize,
  type BoardToken,
  type IconSize,
} from "./boardTokens";
import {
  EMPTY_LIBRARY,
  decodeCompLibrary,
  serializeCompLibrary,
  type CompLibrary,
} from "./compLibrary";
import { TEAMS, TEAM_SIZE } from "./heroes";
import { findBoardMap } from "./maps";
import {
  decodeOpenCompSnapshot,
  emptyOpenComp,
  type OpenCompSnapshot,
} from "./savedComps";
import { storedVersion } from "./storedVersion";

export interface Workspace {
  readonly board: BoardState;
  readonly customMaps: readonly CustomBoardMap[];
  readonly iconSize: IconSize;
  readonly openComp: OpenCompSnapshot;
}

export type DecodeMode = "boot" | "restore";

interface DecodedRecords {
  readonly workspace: Workspace;
  readonly library: CompLibrary;
  readonly boardNotices: readonly string[];
}

interface DecodedBoard {
  readonly board: BoardState;
  readonly iconSize: IconSize;
  readonly notices: readonly string[];
}

export interface BoardRecord {
  readonly version: number;
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

const TEAM_LIMIT_NOTICE = `Saved board limited to the first ${TEAM_SIZE} heroes per team. Extra placements were removed.`;

type BoardMigration = (board: BoardState) => {
  readonly board: BoardState;
  readonly notice: string | null;
};

const BOARD_MIGRATIONS: readonly BoardMigration[] = [
  (board) => {
    const kept = keepEarliestTeamPlacements(board);
    return { board: kept, notice: kept === board ? null : TEAM_LIMIT_NOTICE };
  },
];

export const BOARD_RECORD_VERSION = BOARD_MIGRATIONS.length + 1;

export function isNewerBoardRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record: Partial<Record<string, unknown>> = value;
  return (
    typeof record.version === "number" && record.version > BOARD_RECORD_VERSION
  );
}

export function decodeBoardRecord(
  value: unknown,
  customMaps: readonly CustomBoardMap[],
): DecodedBoard {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid Position Board.");
  const record: Partial<Record<string, unknown>> = value;
  const version = storedVersion(record.version ?? 1, BOARD_RECORD_VERSION);
  const storedMap = (id: string): SelectedBoardMap | undefined => {
    const builtin = findBoardMap(id);
    if (builtin) return { kind: "builtin", id: builtin.id };
    return customMaps.find((map) => map.id === id);
  };
  const map = typeof record.mapId === "string" && storedMap(record.mapId);
  if (!map) throw new Error("The Position Board map is missing.");
  if (!Array.isArray(record.tokens) || record.tokens.length > MAX_BOARD_TOKENS)
    throw new Error("Invalid hero token list.");
  const tokens = record.tokens.map(decodeToken);
  if (new Set(tokens.map((token) => token.id)).size !== tokens.length)
    throw new Error("A hero appears twice on the Position Board.");
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
    const owner = storedMap(mapId);
    if (!owner) throw new Error("Board drawings belong to a missing map.");
    if (!Array.isArray(list)) throw new Error("Invalid board drawings.");
    if (list.length > MAX_DRAWINGS_PER_MAP)
      throw new Error(drawingLimitMessage());
    const decoded = list.map(decodeDrawing);
    if (new Set(decoded.map((drawing) => drawing.id)).size !== decoded.length)
      throw new Error("A drawing ID appears twice on one map.");
    drawingsByMap[owner.id] = decoded;
  }
  let board: BoardState = { map, tokens, drawingsByMap };
  const notices: string[] = [];
  for (const migrate of BOARD_MIGRATIONS.slice(version - 1)) {
    const migrated = migrate(board);
    board = migrated.board;
    if (migrated.notice) notices.push(migrated.notice);
  }
  if (
    TEAMS.some(
      (team) =>
        board.tokens.filter((token) => token.team === team).length > TEAM_SIZE,
    )
  )
    throw new Error(`Position Board teams cannot exceed ${TEAM_SIZE} heroes.`);
  return { board, iconSize: parseIconSize(record.iconSize), notices };
}

export function encodeBoardRecord(
  board: BoardState,
  iconSize: IconSize,
): BoardRecord {
  return {
    version: BOARD_RECORD_VERSION,
    mapId: board.map.id,
    tokens: board.tokens,
    drawingsByMap: board.drawingsByMap,
    iconSize,
  };
}

function decodeIn<T>(mode: DecodeMode, decode: () => T, fallback: () => T): T {
  if (mode === "restore") return decode();
  try {
    return decode();
  } catch {
    return fallback();
  }
}

export function decodeStoredRecords(
  records: StoredRecords,
  mode: DecodeMode,
): DecodedRecords {
  const customMaps = records.customMaps.flatMap((value) =>
    decodeIn(
      mode,
      () => [decodeCustomMap(value)],
      () => [],
    ),
  );
  const { board, iconSize, notices } = decodeIn(
    mode,
    () => decodeBoardRecord(records.board, customMaps),
    (): DecodedBoard => ({
      board: initialBoard(),
      iconSize: DEFAULT_ICON_SIZE,
      notices: [],
    }),
  );
  return {
    workspace: {
      board,
      customMaps,
      iconSize,
      openComp: decodeIn(
        mode,
        () => decodeOpenCompSnapshot(records.openComp),
        emptyOpenComp,
      ),
    },
    library: decodeIn(
      mode,
      () => decodeCompLibrary(records.library ?? serializeCompLibrary([])),
      () => EMPTY_LIBRARY,
    ),
    boardNotices: notices,
  };
}
