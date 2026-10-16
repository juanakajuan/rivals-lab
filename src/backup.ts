import type { BoardDrawing } from "./boardDrawings";
import {
  resolveBoardMap,
  verifyCustomMapImages,
  type CustomBoardMap,
} from "./boardMaps";
import type { IconSize } from "./boardTokens";
import {
  IMPORT_TOO_LARGE,
  MAX_IMPORT_BYTES,
  StoredLibrarySource,
  parseCompLibraryStrict,
  serializeCompLibrary,
  type CompLibrary,
} from "./compLibrary";
import { sameComp, type SavedComp } from "./comps";
import {
  openCompLink,
  type OpenCompLink,
  type OpenCompSnapshot,
} from "./savedComps";
import {
  decodeStoredRecords,
  encodeBoardRecord,
  type BoardRecord,
  type StoredRecords,
  type Workspace,
} from "./workspaceRecord";

export const MAX_BACKUP_BYTES = 80 * 1024 * 1024;

const BACKUP_FORMAT = "rivals-lab-backup";
const BACKUP_TOO_LARGE =
  "This backup is larger than 80 MiB. A Rivals Lab backup holds up to 50 MiB of map images and 2 MB of saved comps.";
const NOT_A_BACKUP = "This file is not a Rivals Lab backup or comps file.";
const ALREADY_APPLIED = "This import was already applied.";

interface BackupFile {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: 1;
  readonly exportedAt: string;
  readonly library: unknown;
  readonly board: BoardRecord;
  readonly customMaps: readonly CustomBoardMap[];
  readonly openComp: OpenCompSnapshot;
}

export interface StoredState {
  readonly workspace: Workspace;
  readonly library: CompLibrary;
}

export interface DataSummary {
  readonly savedComps: number;
  readonly unavailableComps: number;
  readonly openComp: {
    readonly name: string;
    readonly unsaved: boolean;
    readonly link: OpenCompLink;
  } | null;
  readonly boardMapName: string;
  readonly heroes: number;
  readonly drawings: number;
  readonly mapsWithDrawings: number;
  readonly customMaps: number;
  readonly customMapBytes: number;
  readonly iconSize: IconSize;
}

export type ImportPreview =
  | {
      readonly kind: "addComps";
      readonly count: number;
      readonly names: readonly string[];
    }
  | {
      readonly kind: "restore";
      readonly exportedAt: string;
      readonly file: DataSummary;
      readonly current: DataSummary;
      readonly boardNotices: readonly string[];
    };

export interface ImportSource {
  readonly size: number;
  text(): Promise<string>;
}

export type ImportPayload =
  | { readonly kind: "addComps"; readonly comps: readonly SavedComp[] }
  | {
      readonly kind: "restore";
      readonly library: StoredLibrarySource;
      readonly board: BoardRecord;
      readonly openComp: OpenCompSnapshot;
      readonly customMaps: readonly CustomBoardMap[];
    };

export type ImportOutcome =
  | { readonly kind: "added"; readonly count: number }
  | { readonly kind: "reloading" };

export class ImportPlan {
  #payload: ImportPayload | null;

  constructor(
    readonly preview: ImportPreview,
    payload: ImportPayload,
  ) {
    this.#payload = payload;
  }

  take(): ImportPayload {
    const payload = this.#payload;
    if (!payload) throw new Error(ALREADY_APPLIED);
    this.#payload = null;
    return payload;
  }
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function backupDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function encodeBackup(
  records: StoredRecords,
  workspace: Workspace,
  exportedAt: Date,
): { readonly blob: Blob; readonly filename: string } {
  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: exportedAt.toISOString(),
    library: JSON.parse(records.library ?? serializeCompLibrary([])),
    board: encodeBoardRecord(workspace.board, workspace.iconSize),
    customMaps: workspace.customMaps,
    openComp: workspace.openComp,
  };
  const text = JSON.stringify(backup);
  if (utf8Length(text) > MAX_BACKUP_BYTES) throw new Error(BACKUP_TOO_LARGE);
  return {
    blob: new Blob([text], { type: "application/json" }),
    filename: `rivals-lab-backup-${backupDate(exportedAt)}.json`,
  };
}

export function summarize({ workspace, library }: StoredState): DataSummary {
  const { board, openComp, customMaps } = workspace;
  const link = openCompLink(openComp, library.entries);
  const drawingLists = Object.values(board.drawingsByMap).filter(
    (list): list is readonly BoardDrawing[] => Boolean(list?.length),
  );
  return {
    savedComps: library.entries.length,
    unavailableComps: library.unavailable.length,
    openComp:
      link === "empty"
        ? null
        : {
            name: openComp.comp.name,
            unsaved: !sameComp(openComp.comp, openComp.baseline),
            link,
          },
    boardMapName: resolveBoardMap(board.map).name,
    heroes: board.tokens.length,
    drawings: drawingLists.reduce((total, list) => total + list.length, 0),
    mapsWithDrawings: drawingLists.length,
    customMaps: customMaps.length,
    customMapBytes: customMaps.reduce(
      (total, map) => total + map.sourceBytes,
      0,
    ),
    iconSize: workspace.iconSize,
  };
}

async function restorePlan(
  file: Partial<Record<string, unknown>>,
  current: () => Promise<StoredState>,
): Promise<ImportPlan> {
  const { exportedAt } = file;
  if (
    typeof exportedAt !== "string" ||
    !Number.isFinite(Date.parse(exportedAt))
  )
    throw new Error("The backup date is invalid.");
  if (!Array.isArray(file.customMaps))
    throw new Error("The backup has no custom map list.");
  if (typeof file.library !== "object" || file.library === null)
    throw new Error("The backup has no saved comp library.");
  const { workspace, library, boardNotices } = decodeStoredRecords(
    {
      library: JSON.stringify(file.library),
      board: file.board,
      openComp: file.openComp,
      customMaps: file.customMaps,
    },
    "restore",
  );
  const { board, customMaps, iconSize, openComp } = workspace;
  if (new Set(customMaps.map((map) => map.id)).size !== customMaps.length)
    throw new Error("A custom map appears twice in this backup.");
  const source = StoredLibrarySource.encode(library);
  await verifyCustomMapImages(customMaps);
  return new ImportPlan(
    {
      kind: "restore",
      exportedAt,
      file: summarize({ workspace, library }),
      boardNotices,
      current: summarize(await current()),
    },
    {
      kind: "restore",
      library: source,
      board: encodeBoardRecord(board, iconSize),
      openComp,
      customMaps,
    },
  );
}

function compsPlan(source: string): ImportPlan {
  if (utf8Length(source) > MAX_IMPORT_BYTES) throw new Error(IMPORT_TOO_LARGE);
  const comps = parseCompLibraryStrict(source);
  if (!comps.length) throw new Error("This file has no saved comps.");
  return new ImportPlan(
    {
      kind: "addComps",
      count: comps.length,
      names: comps.map((entry) => entry.comp.name),
    },
    { kind: "addComps", comps },
  );
}

export async function readImportFile(
  file: ImportSource,
  current: () => Promise<StoredState>,
): Promise<ImportPlan> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error(BACKUP_TOO_LARGE);
  const text = await file.text();
  if (utf8Length(text) > MAX_BACKUP_BYTES) throw new Error(BACKUP_TOO_LARGE);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is damaged or is not JSON.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new Error(NOT_A_BACKUP);
  const fields: Partial<Record<string, unknown>> = data;
  if ("format" in fields) {
    if (fields.format !== BACKUP_FORMAT) throw new Error(NOT_A_BACKUP);
    if (fields.version !== 1)
      throw new Error(
        "This backup was made by a newer version of Rivals Lab. Update and try again.",
      );
    return restorePlan(fields, current);
  }
  if (fields.version === 1 && Array.isArray(fields.comps)) {
    if (file.size > MAX_IMPORT_BYTES) throw new Error(IMPORT_TOO_LARGE);
    return compsPlan(text);
  }
  throw new Error(NOT_A_BACKUP);
}
