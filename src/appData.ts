import {
  MAX_DRAWINGS_PER_MAP,
  decodeDrawing,
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
  COMP_STORAGE_KEY,
  decodeCompLibrary,
  serializeCompLibrary,
  type CompLibrary,
  type StoredLibrarySource,
} from "./comps";
import { MAPS } from "./maps";
import {
  decodeOpenCompSnapshot,
  emptyOpenComp,
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

  stop(status: AutosaveStatus): void {
    this.stopped = true;
    this.pending.clear();
    this.publish(status);
  }

  private schedule(put: PendingPut): void {
    if (this.stopped) return;
    this.pending.set(`${put.store}/${put.key}`, put);
    this.publish({ kind: "saving" });
    this.draining ??= this.drain();
  }

  private async drain(): Promise<void> {
    let failure: string | null = null;
    try {
      while (this.pending.size && !this.stopped) {
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
    if (this.stopped) return;
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
  return {
    workspace,
    comps: new BrowserCompStorage(connection),
    compStart: { openComp: workspace.openComp, library },
    autosave,
  };
}
