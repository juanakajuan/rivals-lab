import { COMP_STORAGE_KEY } from "./comps";

export interface CompStorage {
  read(): Promise<string | null>;
  update(transform: (source: string | null) => string): Promise<void>;
  subscribe(onChange: () => void): () => void;
}

const STORE = "comp-libraries";

function storedSource(value: unknown): string | null {
  if (typeof value === "string" || value === null) return value;
  throw new Error("The saved comp storage record is invalid.");
}

function transaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, value: unknown) => T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const write = database.transaction(STORE, mode);
    const store = write.objectStore(STORE);
    let result: { readonly value: T } | null = null;
    let failure: Error | null = null;
    write.oncomplete = () => {
      if (result) resolve(result.value);
      else reject(new Error("The saved comp transaction did not complete."));
    };
    write.onabort = () =>
      reject(
        failure ??
          write.error ??
          new Error("The saved comp transaction failed."),
      );
    const request = store.get(COMP_STORAGE_KEY);
    request.onsuccess = () => {
      try {
        const value: unknown = request.result;
        result = { value: operation(store, value) };
      } catch (cause) {
        failure =
          cause instanceof Error
            ? cause
            : new Error("The saved comp transaction failed.", { cause });
        write.abort();
      }
    };
  });
}

class BrowserCompStorage implements CompStorage {
  private connection: Promise<IDBDatabase> | null = null;
  private readonly listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;

  private readonly notify = (): void => {
    for (const listener of this.listeners) listener();
  };

  private readonly receive = (event: MessageEvent<unknown>): void => {
    if (event.data === "libraryChanged") this.notify();
  };

  async read(): Promise<string | null> {
    return transaction(await this.database(), "readonly", (_store, value) =>
      storedSource(value),
    );
  }

  async update(transform: (source: string | null) => string): Promise<void> {
    await transaction(await this.database(), "readwrite", (store, value) => {
      const next = transform(storedSource(value));
      store.put(next, COMP_STORAGE_KEY);
    });
    this.channel?.postMessage("libraryChanged");
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

  private database(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    const connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(
          new Error(
            "This browser cannot save safely. IndexedDB is unavailable.",
          ),
        );
        return;
      }
      const request = indexedDB.open("rivals-lab", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE);
      };
      request.onerror = () =>
        reject(request.error ?? new Error("The comp database could not open."));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.connection = null;
        };
        void transaction(database, "readwrite", (store, value) => {
          if (value === undefined)
            store.put(localStorage.getItem(COMP_STORAGE_KEY), COMP_STORAGE_KEY);
          else storedSource(value);
        }).then(
          () => resolve(database),
          (cause: unknown) => {
            database.close();
            reject(
              cause instanceof Error
                ? cause
                : new Error("The comp database could not initialize.", {
                    cause,
                  }),
            );
          },
        );
      };
    });
    this.connection = connection;
    void connection.catch(() => {
      if (this.connection === connection) this.connection = null;
    });
    return connection;
  }
}

export const browserCompStorage: CompStorage = new BrowserCompStorage();
