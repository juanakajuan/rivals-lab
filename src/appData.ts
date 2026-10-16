import {
  readImportFile,
  encodeBackup,
  type ImportOutcome,
  type ImportPlan,
  type ImportSource,
  type StoredState,
} from "./backup";
import {
  COMP_STORAGE_KEY,
  updateLibrarySource,
  type CompLibrary,
} from "./compLibrary";
import { downloadBlob } from "./downloadBlob";
import { prependCompCopies, type SavedCompSessionStart } from "./savedComps";
import {
  EMPTY_STORED_RECORDS,
  decodeStoredRecords,
  encodeBoardRecord,
  type StoredRecords,
  type Workspace,
} from "./workspaceRecord";
import { errorMessage } from "./errorMessage";

export interface CompStorage {
  read(): Promise<string | null>;
  update(transform: (library: CompLibrary) => CompLibrary): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

export type AutosaveStatus =
  | { readonly kind: "saving" | "saved" | "idle" }
  | { readonly kind: "replacedElsewhere" }
  | { readonly kind: "failed"; readonly message: string };

export interface WorkspaceAutosave {
  sync(workspace: Workspace): void;
  flush(): Promise<void>;
  subscribe(listener: (status: AutosaveStatus) => void): () => void;
}

export interface AppData {
  readonly workspace: Workspace;
  readonly comps: CompStorage;
  readonly compStart: SavedCompSessionStart;
  readonly autosave: WorkspaceAutosave;
  readonly backup: BackupStore;
}

export interface BackupStore {
  exportBackup(): Promise<void>;
  readImportFile(file: ImportSource): Promise<ImportPlan>;
  applyImport(plan: ImportPlan): Promise<ImportOutcome>;
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

const WORKSPACE_REPLACED = "workspaceReplaced";

class ReplacedElsewhereError extends Error {
  constructor() {
    super(REPLACED_ELSEWHERE_MESSAGE);
    this.name = "ReplacedElsewhereError";
  }
}

function asError(cause: unknown, message: string): Error {
  return cause instanceof Error ? cause : new Error(message, { cause });
}

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
    transform: (library: CompLibrary) => CompLibrary,
  ): Promise<void> {
    const connection = await this.connection;
    await connection.write(
      [LIBRARY],
      [[LIBRARY, COMP_STORAGE_KEY]],
      ([value], active) => {
        active
          .objectStore(LIBRARY)
          .put(
            updateLibrarySource(storedSource(value), transform).text,
            COMP_STORAGE_KEY,
          );
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
  readonly mark: () => void;
}

class BrowserAutosave implements WorkspaceAutosave {
  private readonly pending = new Map<string, PendingPut>();
  private readonly listeners = new Set<(status: AutosaveStatus) => void>();
  private status: AutosaveStatus = { kind: "idle" };
  private draining: Promise<void> | null = null;
  private stopped = false;
  private paused = false;
  private confirmedBoard = "";
  private confirmedOpenComp = "";
  private readonly confirmedMaps = new Map<string, string>();

  constructor(private readonly connection: Promise<Connection>) {}

  markPersisted(workspace: Workspace): void {
    this.confirmedBoard = JSON.stringify(
      encodeBoardRecord(workspace.board, workspace.iconSize),
    );
    this.confirmedOpenComp = JSON.stringify(workspace.openComp);
    this.confirmedMaps.clear();
    for (const map of workspace.customMaps)
      this.confirmedMaps.set(map.id, JSON.stringify(map));
  }

  sync(workspace: Workspace): void {
    if (this.stopped) return;
    const board = encodeBoardRecord(workspace.board, workspace.iconSize);
    const boardText = JSON.stringify(board);
    if (boardText !== this.confirmedBoard)
      this.schedule({
        store: WORKSPACE,
        key: "board",
        value: board,
        mark: () => {
          this.confirmedBoard = boardText;
        },
      });
    const openCompText = JSON.stringify(workspace.openComp);
    if (openCompText !== this.confirmedOpenComp)
      this.schedule({
        store: WORKSPACE,
        key: "openComp",
        value: workspace.openComp,
        mark: () => {
          this.confirmedOpenComp = openCompText;
        },
      });
    for (const map of workspace.customMaps) {
      const mapText = JSON.stringify(map);
      if (this.confirmedMaps.get(map.id) === mapText) continue;
      this.schedule({
        store: CUSTOM_MAPS,
        key: map.id,
        value: map,
        mark: () => {
          this.confirmedMaps.set(map.id, mapText);
        },
      });
    }
  }

  flush(): Promise<void> {
    return this.draining ?? Promise.resolve();
  }

  subscribe(listener: (status: AutosaveStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

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
          for (const put of batch) put.mark();
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

class BrowserBackup implements BackupStore {
  constructor(
    private readonly connection: Promise<Connection>,
    private readonly autosave: BrowserAutosave,
    private readonly comps: CompStorage,
    private readonly channel: BroadcastChannel | null,
  ) {}

  private async records(): Promise<StoredRecords> {
    await this.autosave.flush();
    return readStoredRecords(await this.connection);
  }

  private readonly current = async (): Promise<StoredState> =>
    decodeStoredRecords(await this.records());

  async exportBackup(): Promise<void> {
    const records = await this.records();
    const { workspace } = decodeStoredRecords(records);
    downloadBlob(encodeBackup(records, workspace, new Date()));
  }

  readImportFile(file: ImportSource): Promise<ImportPlan> {
    return readImportFile(file, this.current);
  }

  async applyImport(plan: ImportPlan): Promise<ImportOutcome> {
    const payload = plan.take();
    if (payload.kind === "addComps")
      return {
        kind: "added",
        count: await prependCompCopies(this.comps, payload.comps),
      };
    const resume = this.autosave.pause();
    try {
      await this.autosave.flush();
      await (
        await this.connection
      ).write([LIBRARY, CUSTOM_MAPS], [], (_, active) => {
        active.objectStore(LIBRARY).put(payload.library.text, COMP_STORAGE_KEY);
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
    this.autosave.stop({ kind: "idle" });
    this.channel?.postMessage(WORKSPACE_REPLACED);
    window.location.reload();
    return { kind: "reloading" };
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
    () => EMPTY_STORED_RECORDS,
  );
  const { workspace, library } = decodeStoredRecords(records);
  autosave.markPersisted(workspace);
  const comps = new BrowserCompStorage(connection);
  const channel =
    typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(COMP_STORAGE_KEY);
  channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.data === WORKSPACE_REPLACED) replaced();
  });
  return {
    workspace,
    comps,
    compStart: { openComp: workspace.openComp, library },
    autosave,
    backup: new BrowserBackup(connection, autosave, comps, channel),
  };
}
