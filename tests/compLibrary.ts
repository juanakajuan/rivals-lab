import { readFile } from "node:fs/promises";
import { expect, type Locator, type Page } from "@playwright/test";

interface JsonFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

export function backupDialog(page: Page): Locator {
  return page.getByRole("dialog", {
    name: "Back up everything in this browser",
    exact: true,
  });
}

/** Opens the backup dialog through the library footer's Import button. */
export async function openImportDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const dialog = backupDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function addCompCopies(
  page: Page,
  file: JsonFile,
  count: number,
): Promise<void> {
  const dialog = await openImportDialog(page);
  await dialog.getByLabel("Import backup or comps file").setInputFiles(file);
  await expect(
    dialog.getByRole("heading", {
      name: `Add ${count} comp${count === 1 ? "" : "s"} as copies?`,
    }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Add comps", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    `Imported ${count} comp${count === 1 ? "" : "s"} as copies.`,
  );
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(dialog).toBeHidden();
}

export async function readStoredCompLibrary(
  page: Page,
): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const opening = indexedDB.open("rivals-lab");
        opening.onupgradeneeded = () => {
          opening.transaction?.abort();
          reject(new Error("The comp database does not exist."));
        };
        opening.onerror = () =>
          reject(
            opening.error ?? new Error("The comp database could not open."),
          );
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
