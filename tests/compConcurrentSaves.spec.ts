import { expect, test, type Page } from "@playwright/test";
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
      new Promise<void>((resolve) => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (button) => button.textContent === "Save",
        );
        if (!button) throw new Error("Missing Save button.");
        setTimeout(() => {
          button.click();
          resolve();
        }, timestamp - Date.now());
      }),
    timestamp,
  );
}

test("concurrent saves in two tabs keep both new comps", async ({
  page,
  context,
}) => {
  const source = serializeCompLibrary(
    Array.from({ length: 150 }, (_, index) => ({
      id: `existing-${index}`,
      updatedAt: "2026-09-30T12:00:00Z",
      comp: {
        ...emptyComp(),
        name: `Existing ${index}`,
        notes: "x".repeat(9000),
      },
    })),
  );
  expect(new TextEncoder().encode(source).byteLength).toBeLessThan(
    MAX_IMPORT_BYTES,
  );
  await page.goto("/builder");
  await page.evaluate(({ key, source }) => localStorage.setItem(key, source), {
    key: COMP_STORAGE_KEY,
    source,
  });
  await page.reload();
  const other = await context.newPage();
  await other.goto("/builder");
  await page.getByLabel("Comp name", { exact: true }).fill("First tab");
  await other.getByLabel("Comp name", { exact: true }).fill("Second tab");
  const timestamp = Date.now() + 500;
  await Promise.all([saveAt(page, timestamp), saveAt(other, timestamp)]);
  await expect(page.getByRole("status")).toHaveText("Saved First tab.");
  await expect(other.getByRole("status")).toHaveText("Saved Second tab.");
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    COMP_STORAGE_KEY,
  );
  if (!stored) throw new Error("Missing saved library.");
  const entries = parseCompLibrary(stored);
  expect(entries).toHaveLength(152);
  expect(entries.map((entry) => entry.comp.name)).toEqual(
    expect.arrayContaining(["First tab", "Second tab"]),
  );
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
  await page.goto("/builder");
  await page.evaluate(({ key, source }) => localStorage.setItem(key, source), {
    key: COMP_STORAGE_KEY,
    source,
  });
  await page.reload();
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
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    COMP_STORAGE_KEY,
  );
  if (!stored) throw new Error("Missing saved library.");
  expect(parseCompLibrary(stored).map((entry) => entry.comp.notes)).toEqual([
    winningNotes,
  ]);
  await expect(loser.getByLabel("Comp notes", { exact: true })).toHaveValue(
    loser === page ? "First tab edits" : "Second tab edits",
  );
});
