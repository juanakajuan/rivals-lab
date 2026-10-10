import {
  applyImport,
  exportBackup,
  openAppData,
  readImportFile,
  type ImportOutcome,
  type ImportPlan,
  type ImportPreview,
} from "../../src/appData.ts";
import { uploadBoardMap, type CustomBoardMap } from "../../src/boardMaps.ts";
import { prependCompCopies } from "../../src/savedComps.ts";

interface AppDataHarness {
  readonly openAppData: typeof openAppData;
  readonly prependCompCopies: typeof prependCompCopies;
  readonly exportBackup: typeof exportBackup;
  readImport(text: string, size?: number): Promise<ImportPreview>;
  applyImport(): Promise<ImportOutcome>;
  createMap(
    name: string,
    width: number,
    height: number,
  ): Promise<CustomBoardMap>;
  storedRecord(store: string, key: string): Promise<unknown>;
  storeRecord(store: string, key: string, value: unknown): Promise<void>;
  storedRecords(): Promise<Readonly<Record<string, unknown>>>;
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

let plan: ImportPlan | null = null;

window.appDataHarness = {
  openAppData,
  prependCompCopies,
  exportBackup,
  readImport: async (text, size = new Blob([text]).size) => {
    plan = await readImportFile({ size, text: () => Promise.resolve(text) });
    return plan.preview;
  },
  applyImport: () => {
    if (!plan) throw new Error("No import plan was read.");
    return applyImport(plan);
  },
  createMap,
  storedRecord: (store, key) =>
    withStore(store, "readonly", (objectStore) => objectStore.get(key)),
  storedRecords: async () => ({
    library: await withStore("comp-libraries", "readonly", (objectStore) =>
      objectStore.get("rivals-lab.comps.v1"),
    ),
    board: await withStore("workspace", "readonly", (objectStore) =>
      objectStore.get("board"),
    ),
    openComp: await withStore("workspace", "readonly", (objectStore) =>
      objectStore.get("openComp"),
    ),
    customMaps: await withStore("custom-maps", "readonly", (objectStore) =>
      objectStore.getAll(),
    ),
  }),
  storeRecord: async (store, key, value) => {
    await withStore(store, "readwrite", (objectStore) =>
      objectStore.put(value, key),
    );
  },
};
