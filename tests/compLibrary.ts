import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

export async function readStoredCompLibrary(
  page: Page,
): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const opening = indexedDB.open("rivals-lab", 1);
        opening.onupgradeneeded = () => {
          opening.transaction?.abort();
          reject(new Error("The comp database does not exist."));
        };
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction(
            "comp-libraries",
            "readonly",
          );
          const request = transaction
            .objectStore("comp-libraries")
            .get("rivals-lab.comps.v1");
          let source: string | null = null;
          request.onsuccess = () => {
            const value: unknown = request.result;
            if (value === undefined || value === null) return;
            if (typeof value !== "string") {
              transaction.abort();
              reject(
                new Error("The comp database contains an invalid record."),
              );
              return;
            }
            source = value;
          };
          transaction.oncomplete = () => {
            database.close();
            resolve(source);
          };
          transaction.onabort = () => {
            database.close();
            reject(
              transaction.error ?? new Error("The comp read was aborted."),
            );
          };
        };
      }),
  );
}

export async function exportCompLibrary(
  page: Page,
  recovery = false,
): Promise<string> {
  const downloadReady = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: recovery ? "Export stored data for recovery" : "Export all",
      exact: true,
    })
    .click();
  const download = await downloadReady;
  const path = await download.path();
  if (!path) throw new Error("The comp library download has no file.");
  return readFile(path, "utf8");
}
