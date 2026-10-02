import { expect, test, type Page } from "@playwright/test";
import { exportCompLibrary, readStoredCompLibrary } from "./compLibrary";
import {
  COMP_STORAGE_KEY,
  MAX_IMPORT_BYTES,
  emptyComp,
  parseCompLibrary,
  serializeCompLibrary,
} from "../src/comps";

async function saveAt(page: Page, timestamp: number): Promise<void> {
  await page.evaluate(
    (timestamp) =>
      new Promise<void>((resolve, reject) => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (button) => button.textContent === "Save",
        );
        if (!button) throw new Error("Missing Save button.");
        setTimeout(() => {
          try {
            button.click();
            resolve();
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error("The Save button could not be clicked.", {
                    cause: error,
                  }),
            );
          }
        }, timestamp - Date.now());
      }),
    timestamp,
  );
}

async function holdLibraryTransaction(page: Page): Promise<void> {
  await page.evaluate(
    (key) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("rivals-lab", 1);
        opening.onerror = () =>
          reject(
            opening.error ?? new Error("The comp database could not open."),
          );
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction(
            "comp-libraries",
            "readwrite",
          );
          const store = transaction.objectStore("comp-libraries");
          let released = false;
          window.addEventListener(
            "release-library-transaction",
            () => {
              released = true;
            },
            { once: true },
          );
          function keepActive(): void {
            const request = store.get(key);
            request.onsuccess = () => {
              resolve();
              if (!released) keepActive();
            };
          }
          transaction.oncomplete = () => database.close();
          transaction.onabort = () => {
            database.close();
            reject(
              transaction.error ??
                new Error("The comp transaction was aborted."),
            );
          };
          keepActive();
        };
      }),
    COMP_STORAGE_KEY,
  );
}

test("concurrent saves in two tabs keep both new comps", async ({
  page,
  context,
}) => {
  const existing = Array.from({ length: 150 }, (_, index) => ({
    id: `existing-${index}`,
    updatedAt: "2026-09-30T12:00:00Z",
    comp: {
      ...emptyComp(),
      name: `Existing ${index}`,
      notes: "x".repeat(9000),
    },
  }));
  const source = serializeCompLibrary(existing);
  expect(new TextEncoder().encode(source).byteLength).toBeLessThan(
    MAX_IMPORT_BYTES,
  );
  await page.addInitScript(
    ({ key, source }) => localStorage.setItem(key, source),
    {
      key: COMP_STORAGE_KEY,
      source,
    },
  );
  await page.goto("/builder");
  const other = await context.newPage();
  await other.goto("/builder");
  await page.getByLabel("Comp name", { exact: true }).fill("First tab");
  await other.getByLabel("Comp name", { exact: true }).fill("Second tab");
  const timestamp = Date.now() + 500;
  await Promise.all([saveAt(page, timestamp), saveAt(other, timestamp)]);
  await expect(page.getByRole("status")).toHaveText("Saved First tab.");
  await expect(other.getByRole("status")).toHaveText("Saved Second tab.");
  const stored = await exportCompLibrary(page);
  const entries = parseCompLibrary(stored);
  expect(entries).toHaveLength(152);
  expect(entries).toEqual(expect.arrayContaining(existing));
  expect(entries.map((entry) => entry.comp.name)).toEqual(
    expect.arrayContaining(["First tab", "Second tab"]),
  );
  await expect(page.locator(".saved-comp")).toHaveCount(152);
  await expect(other.locator(".saved-comp")).toHaveCount(152);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), COMP_STORAGE_KEY),
  ).toBe(source);
  await page.reload();
  await expect(page.locator(".saved-comp")).toHaveCount(152);
  expect(parseCompLibrary(await exportCompLibrary(page))).toEqual(entries);
});

test("concurrent edits of one saved comp reject one stale save", async ({
  page,
  context,
}) => {
  const source = serializeCompLibrary([
    {
      id: "shared",
      updatedAt: "2026-09-30T12:00:00Z",
      comp: { ...emptyComp(), name: "Shared comp", notes: "Original notes" },
    },
  ]);
  await page.addInitScript(
    ({ key, source }) => localStorage.setItem(key, source),
    {
      key: COMP_STORAGE_KEY,
      source,
    },
  );
  await page.goto("/builder");
  const other = await context.newPage();
  await other.goto("/builder");
  await page
    .getByRole("button", { name: "Load Shared comp", exact: true })
    .click();
  await other
    .getByRole("button", { name: "Load Shared comp", exact: true })
    .click();
  await page.getByLabel("Comp notes", { exact: true }).fill("First tab edits");
  await other
    .getByLabel("Comp notes", { exact: true })
    .fill("Second tab edits");
  const timestamp = Date.now() + 500;
  await Promise.all([saveAt(page, timestamp), saveAt(other, timestamp)]);
  await expect
    .poll(
      async () =>
        (await page.getByRole("alert").count()) +
        (await other.getByRole("alert").count()),
    )
    .toBe(1);
  const loser = (await page.getByRole("alert").count()) ? page : other;
  const winner = loser === page ? other : page;
  await expect(loser.getByRole("alert")).toContainText(
    "changed in another tab",
  );
  await expect(loser.getByRole("status")).toHaveText("Unsaved changes");
  await expect(winner.getByRole("status")).toHaveText("Saved Shared comp.");
  const winningNotes = await winner
    .getByLabel("Comp notes", { exact: true })
    .inputValue();
  const stored = await exportCompLibrary(page);
  expect(parseCompLibrary(stored).map((entry) => entry.comp.notes)).toEqual([
    winningNotes,
  ]);
  await expect(loser.getByLabel("Comp notes", { exact: true })).toHaveValue(
    loser === page ? "First tab edits" : "Second tab edits",
  );
});

for (const change of ["edit", "load"]) {
  test(`a queued save keeps a later local ${change}`, async ({ page }) => {
    await page.goto("/builder");
    await page.getByLabel("Comp name", { exact: true }).fill("Pending comp");
    await page.getByLabel("Comp notes", { exact: true }).fill("Before save");
    await holdLibraryTransaction(page);
    const save = page.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expect(save).toBeDisabled();
    await expect(page.getByRole("status")).not.toHaveText(
      "Saved Pending comp.",
    );
    if (change === "edit") {
      await page.getByLabel("Comp notes", { exact: true }).fill("Later edit");
    } else {
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByRole("button", { name: "New comp", exact: true }).click();
    }
    await page.evaluate(() =>
      window.dispatchEvent(new Event("release-library-transaction")),
    );
    await expect(page.getByRole("alert")).toContainText("changed while saving");
    await expect(save).toBeEnabled();
    expect(await readStoredCompLibrary(page)).toBeNull();
    await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
      change === "edit" ? "Later edit" : "",
    );
    if (change === "edit") {
      await expect(page.getByRole("status")).toHaveText("Unsaved changes");
      await save.click();
      await expect(page.getByRole("status")).toHaveText("Saved Pending comp.");
    } else {
      await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
        "",
      );
    }
  });
}

test("a browser without IndexedDB keeps edits and stored data", async ({
  page,
}) => {
  const source = serializeCompLibrary([
    {
      id: "legacy",
      updatedAt: "2026-09-30T12:00:00Z",
      comp: { ...emptyComp(), name: "Legacy comp" },
    },
  ]);
  await page.addInitScript(
    ({ key, source }) => {
      localStorage.setItem(key, source);
      Object.defineProperty(window, "indexedDB", { value: undefined });
    },
    { key: COMP_STORAGE_KEY, source },
  );
  await page.goto("/builder");
  await page.getByLabel("Comp name", { exact: true }).fill("Unsaved comp");
  await page.getByLabel("Comp notes", { exact: true }).fill("Keep these notes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Could not save changes", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep these notes",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), COMP_STORAGE_KEY),
  ).toBe(source);
});
