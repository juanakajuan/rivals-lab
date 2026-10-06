import {
  MAX_DRAWINGS_PER_MAP,
  decodeDrawing,
  type BoardDrawing,
} from "./boardDrawings";
import {
  decodeCustomMap,
  resolveBoardMap,
  verifyCustomMapImages,
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
  COMP_STORAGE_KEY,
  MAX_IMPORT_BYTES,
  decodeCompLibrary,
  encodeLibraryRecord,
  parseCompLibrary,
  serializeCompLibrary,
  type CompLibrary,
  type SavedComp,
  type StoredLibrarySource,
} from "./comps";
import { downloadBlob } from "./downloadBlob";
import { MAPS } from "./maps";
import {
  decodeOpenCompSnapshot,
  emptyOpenComp,
  openCompLink,
  prependCompCopies,
  sameComp,
  type OpenCompLink,
  type OpenCompSnapshot,
  type SavedCompSessionStart,
} from "./savedComps";

export interface CompStorage {
  read(): Promise<string | null>;
  update(
    transform: (source: string | null) => StoredLibrarySource,
  ): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

export interface Workspace {
  readonly board: BoardState;
  readonly customMaps: readonly CustomBoardMap[];
  readonly iconSize: IconSize;
  readonly openComp: OpenCompSnapshot;
}

export type AutosaveStatus =
  | { readonly kind: "saving" | "saved" | "idle" }
  | { readonly kind: "replacedElsewhere" }
  | { readonly kind: "failed"; readonly message: string };

export interface WorkspaceAutosave {
  board(board: BoardState, iconSize: IconSize): void;
  openComp(openComp: OpenCompSnapshot): void;
  customMap(map: CustomBoardMap): void;
  flush(): Promise<void>;
  subscribe(listener: (status: AutosaveStatus) => void): () => void;
}

export interface AppData {
  readonly workspace: Workspace;
  readonly comps: CompStorage;
  readonly compStart: SavedCompSessionStart;
  readonly autosave: WorkspaceAutosave;
}

export const REPLACED_ELSEWHERE_MESSAGE =
  "This browser's data was replaced in another tab. Reload to continue.";

const DATABASE_NAME = "rivals-lab";
const DATABASE_VERSION = 2;
const LIBRARY = "comp-libraries";
const WORKSPACE = "workspace";
const CUSTOM_MAPS = "custom-maps";
type StoreName = typeof LIBRARY | typeof WORKSPACE | typeof CUSTOM_MAPS;
type Read = readonly [store: StoreName, key: IDBValidKey | null];

interface BoardRecord {
  readonly mapId: BoardMapId;
  readonly tokens: readonly BoardToken[];
  readonly drawingsByMap: BoardState["drawingsByMap"];
  readonly iconSize: IconSize;
}

const EMPTY_LIBRARY: CompLibrary = {
  entries: [],
  unavailable: [],
  errors: [],
  envelope: { version: 1, comps: [] },
};

class ReplacedElsewhereError extends Error {
  constructor() {
    super(REPLACED_ELSEWHERE_MESSAGE);
    this.name = "ReplacedElsewhereError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed.";
}

function asError(cause: unknown, message: string): Error {
  return cause instanceof Error ? cause : new Error(message, { cause });
}

/** Reads run first; the operation then writes synchronously inside the same transaction. */
function transaction<T>(
  database: IDBDatabase,
  stores: readonly StoreName[],
  mode: IDBTransactionMode,
  reads: readonly Read[],
  operation: (values: readonly unknown[], transaction: IDBTransaction) => T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const active = database.transaction([...new Set(stores)], mode);
    let result: { readonly value: T } | null = null;
    let failure: Error | null = null;
    active.oncomplete = () => {
      if (result) resolve(result.value);
      else reject(new Error("The storage transaction did not complete."));
    };
    active.onabort = () =>
      reject(
        failure ?? active.error ?? new Error("The storage transaction failed."),
      );
    const values: unknown[] = [];
    let remaining = reads.length;
    const run = (): void => {
      try {
        result = { value: operation(values, active) };
      } catch (cause) {
        failure = asError(cause, "The storage transaction failed.");
        active.abort();
      }
    };
    if (!remaining) run();
    reads.forEach(([store, key], index) => {
      const objectStore = active.objectStore(store);
      const request: IDBRequest =
        key === null ? objectStore.getAll() : objectStore.get(key);
      request.onsuccess = () => {
        values[index] = request.result;
        if (--remaining === 0) run();
      };
    });
  });
}

function storedSource(value: unknown): string | null {
  if (typeof value === "string" || value === null) return value;
  throw new Error("The saved comp storage record is invalid.");
}

class Connection {
  constructor(
    readonly database: IDBDatabase,
    private readonly epoch: string,
    private readonly onReplaced: () => void,
  ) {}

  /** Every write checks that this tab still owns the stored data generation. */
  async write<T>(
    stores: readonly StoreName[],
    reads: readonly Read[],
    operation: (values: readonly unknown[], transaction: IDBTransaction) => T,
  ): Promise<T> {
    try {
      return await transaction(
        this.database,
        [WORKSPACE, ...stores],
        "readwrite",
        [[WORKSPACE, "epoch"], ...reads],
        ([epoch, ...values], active) => {
          if (epoch !== this.epoch) throw new ReplacedElsewhereError();
          return operation(values, active);
        },
      );
    } catch (error) {
      if (error instanceof ReplacedElsewhereError) this.onReplaced();
      throw error;
    }
  }
}

interface StoredRecords {
  readonly library: string | null;
  readonly board: unknown;
  readonly openComp: unknown;
  readonly customMaps: readonly unknown[];
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new Error("This browser cannot save safely. IndexedDB is unavailable."),
      );
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 1) database.createObjectStore(LIBRARY);
      if (event.oldVersion < 2) {
        database.createObjectStore(WORKSPACE);
        database.createObjectStore(CUSTOM_MAPS);
      }
    };
    request.onerror = () =>
      reject(request.error ?? new Error("The comp database could not open."));
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

async function boot(onReplaced: () => void): Promise<{
  readonly connection: Connection;
  readonly records: StoredRecords;
}> {
  const database = await openDatabase();
  try {
    return await transaction(
      database,
      [LIBRARY, WORKSPACE, CUSTOM_MAPS],
      "readwrite",
      [
        [LIBRARY, COMP_STORAGE_KEY],
        [WORKSPACE, "epoch"],
        [WORKSPACE, "board"],
        [WORKSPACE, "openComp"],
        [CUSTOM_MAPS, null],
      ],
      ([library, storedEpoch, board, openComp, customMaps], active) => {
        let source: string | null;
        if (library === undefined) {
          source = localStorage.getItem(COMP_STORAGE_KEY);
          active.objectStore(LIBRARY).put(source, COMP_STORAGE_KEY);
        } else source = storedSource(library);
        let epoch: string;
        if (typeof storedEpoch === "string") epoch = storedEpoch;
        else {
          epoch = crypto.randomUUID();
          active.objectStore(WORKSPACE).put(epoch, "epoch");
        }
        return {
          connection: new Connection(database, epoch, onReplaced),
          records: {
            library: source,
            board,
            openComp,
            customMaps: Array.isArray(customMaps) ? customMaps : [],
          },
        };
      },
    );
  } catch (cause) {
    database.close();
    throw asError(cause, "The comp database could not initialize.");
  }
}

function decodeBoardRecord(
  value: unknown,
  customMaps: readonly CustomBoardMap[],
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
  if (!Array.isArray(record.tokens) || record.tokens.length > 200)
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
    const owner = maps.get(mapId);
    if (!owner) throw new Error("Board drawings belong to a missing map.");
    if (!Array.isArray(list)) throw new Error("Invalid board drawings.");
    if (list.length > MAX_DRAWINGS_PER_MAP)
      throw new Error(
        `A map can hold at most ${MAX_DRAWINGS_PER_MAP.toLocaleString("en")} drawings.`,
      );
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

function encodeBoardRecord(board: BoardState, iconSize: IconSize): BoardRecord {
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

/** Boot keeps every part that still decodes and starts fresh for the rest. */
function decodeStoredRecords(records: StoredRecords): {
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
    () => decodeBoardRecord(records.board, customMaps),
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

class BrowserCompStorage implements CompStorage {
  private readonly listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;

  constructor(private readonly connection: Promise<Connection>) {}

  private readonly notify = (): void => {
    for (const listener of this.listeners) listener();
  };

  private readonly receive = (event: MessageEvent<unknown>): void => {
    if (event.data === "libraryChanged") this.notify();
  };

  async read(): Promise<string | null> {
    const { database } = await this.connection;
    return transaction(
      database,
      [LIBRARY],
      "readonly",
      [[LIBRARY, COMP_STORAGE_KEY]],
      ([value]) => storedSource(value),
    );
  }

  async update(
    transform: (source: string | null) => StoredLibrarySource,
  ): Promise<void> {
    const connection = await this.connection;
    await connection.write(
      [LIBRARY],
      [[LIBRARY, COMP_STORAGE_KEY]],
      ([value], active) => {
        active
          .objectStore(LIBRARY)
          .put(transform(storedSource(value)), COMP_STORAGE_KEY);
      },
    );
    this.channel?.postMessage("libraryChanged");
    this.notify();
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    if (this.listeners.size === 1) {
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel(COMP_STORAGE_KEY);
        this.channel.addEventListener("message", this.receive);
      }
      window.addEventListener("focus", this.notify);
      window.addEventListener("pageshow", this.notify);
    }
    return () => {
      this.listeners.delete(onChange);
      if (this.listeners.size) return;
      this.channel?.close();
      this.channel = null;
      window.removeEventListener("focus", this.notify);
      window.removeEventListener("pageshow", this.notify);
    };
  }
}

interface PendingPut {
  readonly store: StoreName;
  readonly key: string;
  readonly value: unknown;
}

class BrowserAutosave implements WorkspaceAutosave {
  private readonly pending = new Map<string, PendingPut>();
  private readonly listeners = new Set<(status: AutosaveStatus) => void>();
  private status: AutosaveStatus = { kind: "idle" };
  private draining: Promise<void> | null = null;
  private stopped = false;
  private paused = false;

  constructor(private readonly connection: Promise<Connection>) {}

  board(board: BoardState, iconSize: IconSize): void {
    this.schedule({
      store: WORKSPACE,
      key: "board",
      value: encodeBoardRecord(board, iconSize),
    });
  }

  openComp(openComp: OpenCompSnapshot): void {
    this.schedule({ store: WORKSPACE, key: "openComp", value: openComp });
  }

  customMap(map: CustomBoardMap): void {
    this.schedule({ store: CUSTOM_MAPS, key: map.id, value: map });
  }

  flush(): Promise<void> {
    return this.draining ?? Promise.resolve();
  }

  subscribe(listener: (status: AutosaveStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  /** Holds new writes in the queue until the returned resume runs. */
  pause(): () => void {
    this.paused = true;
    return () => {
      this.paused = false;
      if (this.pending.size) this.draining ??= this.drain();
    };
  }

  stop(status: AutosaveStatus): void {
    this.stopped = true;
    this.pending.clear();
    this.publish(status);
  }

  private schedule(put: PendingPut): void {
    if (this.stopped) return;
    this.pending.set(`${put.store}/${put.key}`, put);
    this.publish({ kind: "saving" });
    if (!this.paused) this.draining ??= this.drain();
  }

  private async drain(): Promise<void> {
    let failure: string | null = null;
    try {
      while (this.pending.size && !this.stopped && !this.paused) {
        const batch = [...this.pending.values()];
        this.pending.clear();
        try {
          const connection = await this.connection;
          await connection.write([WORKSPACE, CUSTOM_MAPS], [], (_, active) => {
            for (const put of batch)
              active.objectStore(put.store).put(put.value, put.key);
          });
          failure = null;
        } catch (error) {
          if (error instanceof ReplacedElsewhereError) return;
          failure = errorMessage(error);
        }
      }
    } finally {
      this.draining = null;
    }
    if (this.stopped || this.paused) return;
    this.publish(
      failure === null
        ? { kind: "saved" }
        : { kind: "failed", message: failure },
    );
  }

  private publish(status: AutosaveStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }
}

interface OpenedData {
  readonly connection: Promise<Connection>;
  readonly autosave: BrowserAutosave;
  readonly comps: BrowserCompStorage;
  readonly channel: BroadcastChannel | null;
}

let opened: OpenedData | null = null;

function openedData(): OpenedData {
  if (!opened) throw new Error("Rivals Lab data is not open yet.");
  return opened;
}

const WORKSPACE_REPLACED = "workspaceReplaced";

export async function openAppData(): Promise<AppData> {
  let autosave: BrowserAutosave | null = null;
  const replaced = (): void => autosave?.stop({ kind: "replacedElsewhere" });
  const booting = boot(replaced);
  const connection = booting.then(({ connection }) => connection);
  connection.catch(() => {});
  autosave = new BrowserAutosave(connection);
  const records = await booting.then(
    ({ records }) => records,
    (): StoredRecords => ({
      library: null,
      board: undefined,
      openComp: undefined,
      customMaps: [],
    }),
  );
  const { workspace, library } = decodeStoredRecords(records);
  const comps = new BrowserCompStorage(connection);
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(COMP_STORAGE_KEY);
  channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.data === WORKSPACE_REPLACED) replaced();
  });
  opened?.channel?.close();
  opened = { connection, autosave, comps, channel };
  return {
    workspace,
    comps,
    compStart: { openComp: workspace.openComp, library },
    autosave,
  };
}

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

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function readStoredRecords(connection: Connection): Promise<StoredRecords> {
  return transaction(
    connection.database,
    [LIBRARY, WORKSPACE, CUSTOM_MAPS],
    "readonly",
    [
      [LIBRARY, COMP_STORAGE_KEY],
      [WORKSPACE, "board"],
      [WORKSPACE, "openComp"],
      [CUSTOM_MAPS, null],
    ],
    ([library, board, openComp, customMaps]) => ({
      library: library === undefined ? null : storedSource(library),
      board,
      openComp,
      customMaps: Array.isArray(customMaps) ? customMaps : [],
    }),
  );
}

async function storedState(): Promise<{
  readonly records: StoredRecords;
  readonly workspace: Workspace;
  readonly library: CompLibrary;
}> {
  const { connection, autosave } = openedData();
  await autosave.flush();
  const records = await readStoredRecords(await connection);
  return { records, ...decodeStoredRecords(records) };
}

function backupDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function exportBackup(): Promise<void> {
  const { records, workspace } = await storedState();
  const exportedAt = new Date();
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
  downloadBlob({
    blob: new Blob([text], { type: "application/json" }),
    filename: `rivals-lab-backup-${backupDate(exportedAt)}.json`,
  });
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
    };

export interface ImportSource {
  readonly size: number;
  text(): Promise<string>;
}

type ImportPayload =
  | { readonly kind: "addComps"; readonly comps: readonly SavedComp[] }
  | {
      readonly kind: "restore";
      readonly library: StoredLibrarySource;
      readonly board: BoardRecord;
      readonly openComp: OpenCompSnapshot;
      readonly customMaps: readonly CustomBoardMap[];
    };

const PLAN = Symbol("ImportPlan");

/** Only readImportFile makes a plan, and applyImport consumes it. */
export interface ImportPlan {
  readonly preview: ImportPreview;
  readonly [PLAN]: true;
}

const payloads = new WeakMap<ImportPlan, ImportPayload>();

function importPlan(
  preview: ImportPreview,
  payload: ImportPayload,
): ImportPlan {
  const plan: ImportPlan = { preview, [PLAN]: true };
  payloads.set(plan, payload);
  return plan;
}

function summarize(workspace: Workspace, library: CompLibrary): DataSummary {
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
): Promise<ImportPlan> {
  const { exportedAt } = file;
  if (
    typeof exportedAt !== "string" ||
    !Number.isFinite(Date.parse(exportedAt))
  )
    throw new Error("The backup date is invalid.");
  if (!Array.isArray(file.customMaps))
    throw new Error("The backup has no custom map list.");
  const customMaps = file.customMaps.map(decodeCustomMap);
  if (new Set(customMaps.map((map) => map.id)).size !== customMaps.length)
    throw new Error("A custom map appears twice in this backup.");
  const { board, iconSize } = decodeBoardRecord(file.board, customMaps);
  const openComp = decodeOpenCompSnapshot(file.openComp);
  if (typeof file.library !== "object" || file.library === null)
    throw new Error("The backup has no saved comp library.");
  const library = decodeCompLibrary(JSON.stringify(file.library));
  const source = encodeLibraryRecord(library);
  await verifyCustomMapImages(customMaps);
  const current = await storedState();
  return importPlan(
    {
      kind: "restore",
      exportedAt,
      file: summarize({ board, customMaps, iconSize, openComp }, library),
      current: summarize(current.workspace, current.library),
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
  if (utf8Length(source) > MAX_IMPORT_BYTES)
    throw new Error("The file must be smaller than 2 MB.");
  const comps = parseCompLibrary(source);
  if (!comps.length) throw new Error("This file has no saved comps.");
  return importPlan(
    {
      kind: "addComps",
      count: comps.length,
      names: comps.map((entry) => entry.comp.name),
    },
    { kind: "addComps", comps },
  );
}

/** Validates the whole file and writes nothing. */
export async function readImportFile(file: ImportSource): Promise<ImportPlan> {
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
    return restorePlan(fields);
  }
  if (fields.version === 1 && Array.isArray(fields.comps)) {
    if (file.size > MAX_IMPORT_BYTES)
      throw new Error("The file must be smaller than 2 MB.");
    return compsPlan(text);
  }
  throw new Error(NOT_A_BACKUP);
}

export type ImportOutcome =
  | { readonly kind: "added"; readonly count: number }
  | { readonly kind: "reloading" };

export async function applyImport(plan: ImportPlan): Promise<ImportOutcome> {
  const payload = payloads.get(plan);
  if (!payload) throw new Error(ALREADY_APPLIED);
  payloads.delete(plan);
  const { connection, autosave, comps, channel } = openedData();
  if (payload.kind === "addComps")
    return {
      kind: "added",
      count: await prependCompCopies(comps, payload.comps),
    };
  const resume = autosave.pause();
  try {
    await autosave.flush();
    await (
      await connection
    ).write([LIBRARY, CUSTOM_MAPS], [], (_, active) => {
      active.objectStore(LIBRARY).put(payload.library, COMP_STORAGE_KEY);
      const workspace = active.objectStore(WORKSPACE);
      workspace.put(crypto.randomUUID(), "epoch");
      workspace.put(payload.board, "board");
      workspace.put(payload.openComp, "openComp");
      const maps = active.objectStore(CUSTOM_MAPS);
      maps.clear();
      for (const map of payload.customMaps) maps.put(map, map.id);
    });
  } catch (error) {
    resume();
    throw error;
  }
  autosave.stop({ kind: "idle" });
  channel?.postMessage(WORKSPACE_REPLACED);
  window.location.reload();
  return { kind: "reloading" };
}
