import { openAppData } from "../../src/appData.ts";
import { uploadBoardMap, type CustomBoardMap } from "../../src/boardMaps.ts";
import { prependCompCopies } from "../../src/savedComps.ts";

interface AppDataHarness {
  readonly openAppData: typeof openAppData;
  readonly prependCompCopies: typeof prependCompCopies;
  createMap(
    name: string,
    width: number,
    height: number,
  ): Promise<CustomBoardMap>;
  storedRecord(store: string, key: string): Promise<unknown>;
  storeRecord(store: string, key: string, value: unknown): Promise<void>;
}

declare global {
  interface Window {
    appDataHarness: AppDataHarness;
  }
}

async function createMap(
  name: string,
  width: number,
  height: number,
): Promise<CustomBoardMap> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Missing fixture canvas");
  context.fillStyle = "#3a86ff";
  context.fillRect(0, 0, width / 2, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Cannot encode fixture image");
  const result = await uploadBoardMap(
    new File([blob], name, { type: "image/png" }),
    [],
  );
  if (result.kind === "error") throw new Error(result.message);
  return result.map;
}

function withStore(
  store: string,
  mode: IDBTransactionMode,
  operation: (objectStore: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("rivals-lab");
    opening.onerror = () => reject(opening.error ?? new Error("Open failed"));
    opening.onsuccess = () => {
      const database = opening.result;
      const active = database.transaction(store, mode);
      const request = operation(active.objectStore(store));
      active.oncomplete = () => {
        database.close();
        resolve(request.result);
      };
      active.onabort = () => {
        database.close();
        reject(active.error ?? new Error("Transaction aborted"));
      };
    };
  });
}

window.appDataHarness = {
  openAppData,
  prependCompCopies,
  createMap,
  storedRecord: (store, key) =>
    withStore(store, "readonly", (objectStore) => objectStore.get(key)),
  storeRecord: async (store, key, value) => {
    await withStore(store, "readwrite", (objectStore) =>
      objectStore.put(value, key),
    );
  },
};
