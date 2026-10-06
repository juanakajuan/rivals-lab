import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { parsePending, parseReleases } from "../scripts/releases";

for (const path of ["/", "/board", "/unknown-page"]) {
  test(`${path} opens the board and keeps it after refresh`, async ({
    page,
  }) => {
    await page.goto(path);
    const boardLink = page.getByRole("link", {
      name: "Position Board",
      exact: true,
    });
    await expect(boardLink).toHaveAttribute("href", "/board");
    await expect(boardLink).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: "Clear", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(boardLink).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: "Clear", exact: true }),
    ).toBeVisible();
  });
}

test("builder direct loads and refresh keep the page and the unsaved comp", async ({
  page,
}) => {
  await page.goto("/builder");
  const builderLink = page.getByRole("link", {
    name: "Draft / Comp Builder",
    exact: true,
  });
  await expect(builderLink).toHaveAttribute("href", "/builder");
  await expect(builderLink).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Comp notes", { exact: true }).fill("Unsaved note");
  await page.reload();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(builderLink).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Unsaved note",
  );
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
});

test("links and Back/Forward keep both pages' in-session edits", async ({
  page,
}) => {
  await page.goto("/board");
  const boardLink = page.getByRole("link", {
    name: "Position Board",
    exact: true,
  });
  const builderLink = page.getByRole("link", {
    name: "Draft / Comp Builder",
    exact: true,
  });
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await builderLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/builder$/);
  await page.getByLabel("Comp notes", { exact: true }).fill("Keep this note");
  await builderLink.click();
  await page.goBack();
  await expect(page).toHaveURL(/\/board$/);
  await expect(boardLink).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("button", { name: "Allies 0", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await page.goForward();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep this note",
  );
  await boardLink.click();
  await expect(page).toHaveURL(/\/board$/);
  await expect(
    page.getByRole("button", { name: "Allies 0", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep this note",
  );
});

test("changelog direct load, refresh, and history preserve editor changes", async ({
  page,
}) => {
  await page.goto("/changelog");
  const link = page.getByRole("link", { name: "Changelog", exact: true });
  await expect(link).toHaveAttribute("href", "/changelog");
  await expect(link).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Changelog", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[data-release-id="snapshot-2026-10-01"] time'),
  ).toHaveAttribute("datetime", "2026-10-01");
  const published = parseReleases(
    JSON.parse(await readFile("releases/published.json", "utf8")),
  );
  const pending = parsePending(
    JSON.parse(await readFile("releases/pending.json", "utf8")),
  );
  const publishedIds = new Set(
    published.flatMap((release) => release.notes.map((note) => note.id)),
  );
  const renderedIds = await page
    .locator("[data-note-id]")
    .evaluateAll((notes) =>
      notes.map((note) => note.getAttribute("data-note-id")),
    );
  expect(renderedIds).toContain("snapshot-board");
  for (const note of pending) {
    if (!publishedIds.has(note.id)) expect(renderedIds).not.toContain(note.id);
  }
  await page.reload();
  await expect(link).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Keep after changelog");
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/changelog$/);
  await page.goBack();
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep after changelog",
  );
  await page.goForward();
  await expect(link).toHaveAttribute("aria-current", "page");
});
