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

test("builder direct loads and refresh keep the page without saving unsaved edits", async ({
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
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue("");
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

test("a direct builder load transfers to a visible slider and keeps edits through history", async ({
  page,
}) => {
  await page.goto("/builder");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Keep after board transfer");
  await page
    .getByRole("button", { name: "Allies slot 1: Choose hero", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Angela", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open on Position Board", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Choose a Position Board map", exact: true })
    .getByRole("button", {
      name: "Intergalactic Empire of Wakanda: Birnin T'Challa",
      exact: true,
    })
    .click();
  await page
    .getByRole("alertdialog", { name: "Replace board placements?" })
    .getByRole("button", { name: "Replace placements", exact: true })
    .click();
  await expect(page).toHaveURL(/\/board$/);
  await expect(
    page.getByRole("button", { name: "Allies 1", exact: true }),
  ).toBeVisible();
  const thumb = page.locator('[data-slot="slider-thumb"]');
  const slider = page.getByRole("slider", { name: "Hero icon size" });
  await expect(thumb).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuenow", "100");
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "50");
  await page.goBack();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep after board transfer",
  );
  await expect(
    page.getByRole("button", { name: "Allies slot 1: Angela", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/board$/);
  await expect(thumb).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuenow", "50");
  await expect(
    page.getByRole("button", { name: "Allies 1", exact: true }),
  ).toBeVisible();
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

test("Back closes builder dialogs and confirmations while keeping edits", async ({
  page,
}) => {
  await page.goto("/board");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Keep through open overlays");
  await page.getByRole("button", { name: "Comp map", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose comp map", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Position Board", exact: true }),
  ).toBeFocused();
  await page.goForward();
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep through open overlays",
  );
  await page.getByRole("button", { name: "New comp", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep through open overlays",
  );
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("Back closes a board color popover and keeps board history", async ({
  page,
}) => {
  await page.goto("/builder");
  await page.getByRole("link", { name: "Position Board", exact: true }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page
    .getByRole("button", { name: "Drawing color", exact: true })
    .click();
  await expect(page.getByLabel("Hex color", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByLabel("Hex color", { exact: true })).toHaveCount(0);
  await page.goForward();
  await expect(
    page.getByRole("button", { name: "Allies 0", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Hex color", { exact: true })).toHaveCount(0);
});
