import { expect, test, type Page } from "@playwright/test";
import { emptyComp } from "../src/comps";
import { emptyDraft } from "../src/draft";
import {
  addCompCopies,
  exportCompLibrary,
  openImportDialog,
  readStoredCompLibrary,
} from "./compLibrary";

async function openBuilder(page: Page): Promise<void> {
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
}

async function pickHero(page: Page, slot: string, hero: string): Promise<void> {
  await page.getByRole("button", { name: slot, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: hero, exact: true })
    .click();
}

async function chooseCompMap(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Comp map", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose comp map", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}

test("named comps, notes, copies and JSON imports survive reload without data loss", async ({
  page,
}) => {
  await page.goto("/");
  await openBuilder(page);
  await page.getByLabel("Comp name", { exact: true }).fill("Midtown dive");
  await chooseCompMap(page, "Midtown");
  const preview = page.locator(".selected-map-preview");
  await expect(preview.locator("figcaption")).toHaveText("Midtown · Convoy");
  await expect(preview.locator(".selected-map-trigger img")).toHaveAttribute(
    "src",
    "/map-previews/midtown.webp",
  );
  await expect(preview.locator(".selected-map-trigger img")).toBeVisible();
  await pickHero(page, "Allies slot 1: Choose hero", "Doctor Strange");
  await pickHero(page, "Opponents slot 1: Choose hero", "Doctor Strange");
  await page.getByLabel("Allies slot 1 notes").fill("Hold the corner.");
  await page.getByLabel("Draft format").selectOption("mrc");
  await pickHero(page, "Allies ban 4: Choose hero", "Hulk");
  await pickHero(page, "Opponents save 2: Choose hero", "Luna Snow");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Take high ground.\nSave portals for the rotation.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Midtown dive.");
  const original = page.getByRole("button", {
    name: "Load Midtown dive",
    exact: true,
  });
  await expect(original.locator(".saved-comp-map")).toHaveText("Midtown");
  await expect(original.locator(".saved-map-preview")).toHaveAttribute(
    "src",
    "/map-previews/midtown.webp",
  );
  await page.reload();
  await openBuilder(page);
  await page
    .getByRole("button", { name: "Load Midtown dive", exact: true })
    .click();
  await expect(preview.locator("figcaption")).toHaveText("Midtown · Convoy");
  await expect(preview.locator(".selected-map-trigger img")).toHaveAttribute(
    "src",
    "/map-previews/midtown.webp",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Take high ground.\nSave portals for the rotation.",
  );
  await expect(page.getByLabel("Allies slot 1 notes")).toHaveValue(
    "Hold the corner.",
  );
  await expect(
    page.getByRole("button", { name: "Allies ban 4: Hulk", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Allies ban 1: Choose hero",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Opponents save 2: Luna Snow",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Allies slot 2: Choose hero", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Doctor Strange — Already on this team." }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Comp name").fill("Dive copy");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Load Midtown dive", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load Dive copy", exact: true }),
  ).toBeVisible();
  const copy = page.getByRole("button", {
    name: "Load Dive copy",
    exact: true,
  });
  await expect(copy.locator(".saved-comp-map")).toHaveText("Midtown");
  await expect(copy.locator(".saved-map-preview")).toHaveAttribute(
    "src",
    "/map-previews/midtown.webp",
  );
  await page.reload();
  await openBuilder(page);
  await copy.click();
  await expect(preview.locator("figcaption")).toHaveText("Midtown · Convoy");
  page.once("dialog", (dialog) => dialog.accept());
  await chooseCompMap(page, "Any map");
  await expect(preview.locator(".selected-map-trigger img")).toHaveCount(0);
  await expect(page.locator(".selected-map-preview figcaption")).toHaveText(
    "Any map",
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Dive copy.");
  await expect(copy.locator(".saved-map-preview")).toHaveCount(0);
  await expect(copy.locator(".saved-comp-map")).toHaveText("Any map");
  await expect(original.locator(".saved-comp-map")).toHaveText("Midtown");
  const exported = await exportCompLibrary(page);
  await addCompCopies(
    page,
    {
      name: "comps.json",
      mimeType: "application/json",
      buffer: Buffer.from(exported),
    },
    2,
  );
  await expect(page.locator(".saved-comp")).toHaveCount(4);
  const dialog = await openImportDialog(page);
  await dialog.getByLabel("Import backup or comps file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version": 99}'),
  });
  await expect(dialog.getByRole("alert")).toHaveText(
    "Import failed. This file is not a Rivals Lab backup or comps file.",
  );
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(page.locator(".saved-comp")).toHaveCount(4);
});

test("direct bans and saves apply at once and can be replaced or cleared", async ({
  page,
}) => {
  await page.goto("/");
  await openBuilder(page);
  await pickHero(page, "Allies slot 1: Choose hero", "Doctor Strange");
  await page.getByLabel("Draft format").selectOption("mrc");
  await expect(page.getByRole("button", { name: /Choose ban/ })).toHaveCount(0);
  for (const team of ["ally", "enemy"])
    await expect(
      page.locator(`.draft-team-row[data-team="${team}"] .step-number`),
    ).toHaveText(["Ban 1", "Save 1", "Ban 2", "Save 2", "Ban 3", "Ban 4"]);
  const firstBox = page
    .locator('.draft-team-row[data-team="ally"] .draft-step')
    .first();
  await expect(firstBox.locator(".draft-slot-button")).toHaveCSS(
    "border-top-style",
    "dashed",
  );
  const boxBounds = await firstBox.boundingBox();
  const buttonBounds = await firstBox
    .locator(".draft-slot-button")
    .boundingBox();
  expect(buttonBounds).toEqual(boxBounds);
  await firstBox.click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();

  await pickHero(page, "Opponents ban 4: Choose hero", "Doctor Strange");
  await expect(page.locator(".has-conflict")).toHaveCount(1);
  await pickHero(page, "Opponents ban 4: Doctor Strange", "Hulk");
  await expect(page.locator(".has-conflict")).toHaveCount(0);
  await pickHero(page, "Allies save 2: Choose hero", "Luna Snow");
  await page
    .getByRole("button", { name: "Allies ban 2: Choose hero", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Luna Snow — Protected for this team." }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await pickHero(page, "Allies ban 1: Choose hero", "Hulk");
  await expect(firstBox.locator(".draft-slot-button")).toHaveCSS(
    "border-top-style",
    "solid",
  );
  const filledBounds = await firstBox.boundingBox();
  if (!filledBounds) throw new Error("Missing draft box");
  await firstBox.click({ position: { x: 2, y: filledBounds.height - 2 } });
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();

  await page
    .getByRole("button", { name: "Clear Allies ban 1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Opponents ban 4: Hulk", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear Opponents ban 4", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear Allies save 2", exact: true })
    .click();
  await page.getByLabel("Draft format").selectOption("ignite");
  await expect(
    page.locator('.draft-team-row[data-team="ally"] .step-number'),
  ).toHaveText([
    "Ban 1",
    "Save 1",
    "Ban 2",
    "Ban 3",
    "Ban 4",
    "Save 2",
    "Ban 5",
  ]);
  await expect(
    page.locator('.draft-team-row[data-team="enemy"] .step-number'),
  ).toHaveText([
    "Ban 1",
    "Ban 2",
    "Save 1",
    "Ban 3",
    "Save 2",
    "Ban 4",
    "Ban 5",
  ]);

  await pickHero(page, "Opponents ban 5: Choose hero", "Doctor Strange");
  await expect(page.locator(".has-conflict")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear Opponents ban 5", exact: true })
    .click();
  await expect(page.locator(".has-conflict")).toHaveCount(0);
  await pickHero(page, "Allies save 2: Choose hero", "Doctor Strange");
  await pickHero(page, "Allies ban 5: Choose hero", "Doctor Strange");
  await expect(page.locator(".has-conflict")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Clear (Allies|Opponents) (ban|save)/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Allies slot 1: Doctor Strange",
      exact: true,
    }),
  ).toBeVisible();
});

test("board transfer requires a supported map and confirms replacement; edits stay in the builder", async ({
  page,
}) => {
  await page.goto("/");
  await openBuilder(page);
  await expect(page).toHaveURL(/\/builder$/);
  await pickHero(page, "Allies slot 1: Choose hero", "Hulk");
  await pickHero(page, "Opponents slot 1: Choose hero", "Loki");
  await chooseCompMap(page, "Midtown");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Preserve these notes.");
  await page.getByRole("button", { name: "Open on Position Board" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Midtown has no board image yet.",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("dialog", { name: "Choose a Position Board map", exact: true })
    .getByRole("button", { name: "Museum of Contemplation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/board$/);
  await expect(
    page.getByRole("heading", { name: "Museum of Contemplation", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".hero-row.placed")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Allies 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Opponents 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Intergalactic Empire of Wakanda: Birnin T'Challa",
  );
  await expect(
    page.getByRole("button", { name: "Allies 3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Opponents 3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Museum of Contemplation",
  );
  await expect(
    page.getByRole("button", { name: "Allies 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Opponents 1", exact: true }),
  ).toBeVisible();
  const bounds = await page.locator(".stage-host canvas").first().boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  const scale = bounds.width / 1200;
  await page.mouse.click(bounds.x + 268 * scale, bounds.y + 197 * scale);
  await expect(page.locator(".selection-name strong")).toHaveText("Hulk");
  await openBuilder(page);
  await expect(page.locator(".selected-map-preview figcaption")).toHaveText(
    "Midtown · Convoy",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Preserve these notes.",
  );
  await page.getByLabel("Allies slot 1 notes").fill("abc");
  await page.getByLabel("Allies slot 1 notes").press("Backspace");
  await expect(page.getByLabel("Allies slot 1 notes")).toHaveValue("ab");
  await page.getByRole("link", { name: "Position Board", exact: true }).focus();
  await page.keyboard.press("Control+z");
  await page.getByRole("link", { name: "Position Board", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Allies 1", exact: true }),
  ).toBeVisible();
  await openBuilder(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "New comp", exact: true }).click();
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Preserve these notes.",
  );
});

test("corrupt browser saves are kept and a failed save does not claim success", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("rivals-lab.comps.v1", "broken saved data"),
  );
  await page.goto("/");
  await openBuilder(page);
  await expect(page.getByRole("alert")).toContainText(
    "Saved comps could not be read",
  );
  await page.getByLabel("Comp name", { exact: true }).fill("Do not overwrite");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Could not save changes.", { exact: false }),
  ).toBeVisible();
  expect(await exportCompLibrary(page, true)).toBe("broken saved data");
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
});

test("Deadpool role choices persist, transfer to the board, and obey hero limits", async ({
  page,
}) => {
  await page.goto("/");
  await openBuilder(page);
  await page.getByLabel("Comp name", { exact: true }).fill("Deadpool support");
  await chooseCompMap(page, "Museum of Contemplation");
  await pickHero(page, "Allies slot 1: Choose hero", "Deadpool · Strategist");
  await expect(
    page
      .getByRole("region", { name: "Allies composition" })
      .locator(".role-counts"),
  ).toHaveText("1 Strategist");
  await page.getByLabel("Allies slot 1 notes").fill("Stay near the back line.");
  await page.getByLabel("Allies slot 1 Deadpool role").selectOption("Duelist");
  await expect(
    page
      .getByRole("region", { name: "Allies composition" })
      .locator(".role-counts"),
  ).toHaveText("1 Duelist");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Deadpool support.");
  await page.reload();
  await openBuilder(page);
  await page
    .getByRole("button", { name: "Load Deadpool support", exact: true })
    .click();
  await expect(page.getByLabel("Allies slot 1 Deadpool role")).toHaveValue(
    "Duelist",
  );
  await expect(page.getByLabel("Allies slot 1 notes")).toHaveValue(
    "Stay near the back line.",
  );
  const exported = await exportCompLibrary(page);
  await addCompCopies(
    page,
    {
      name: "deadpool.json",
      mimeType: "application/json",
      buffer: Buffer.from(exported),
    },
    1,
  );
  await page
    .getByRole("button", { name: "Load Deadpool support", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Allies slot 1 Deadpool role")).toHaveValue(
    "Duelist",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Open on Position Board" }).click();
  const bounds = await page.locator(".stage-host canvas").first().boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  const scale = bounds.width / 1200;
  await page.mouse.click(bounds.x + 268 * scale, bounds.y + 197 * scale);
  await expect(page.locator(".selection-name strong")).toHaveText(
    "Deadpool · Duelist",
  );
  await openBuilder(page);
  await page
    .getByRole("button", { name: "Allies slot 2: Choose hero", exact: true })
    .click();
  for (const role of ["Vanguard", "Duelist", "Strategist"]) {
    await expect(
      page.getByRole("dialog").getByRole("button", {
        name: `Deadpool · ${role} — Already on this team.`,
        exact: true,
      }),
    ).toBeDisabled();
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Draft format").selectOption("mrc");
  await pickHero(page, "Allies ban 1: Choose hero", "Deadpool");
  await expect(page.locator(".has-conflict")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Opponents slot 1: Choose hero", exact: true })
    .click();
  for (const role of ["Vanguard", "Duelist", "Strategist"]) {
    await expect(
      page.getByRole("dialog").getByRole("button", {
        name: `Deadpool · ${role} — Banned for this team.`,
        exact: true,
      }),
    ).toBeDisabled();
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  await pickHero(page, "Allies slot 1: Deadpool", "Hulk");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Deadpool support.");
  await expect(page.getByLabel("Allies slot 1 Deadpool role")).toHaveCount(0);
});

test("mixed saved data stays recoverable through valid library changes", async ({
  page,
}) => {
  const comp = { ...emptyComp(), name: "Valid comp" };
  const saved = { id: "valid", updatedAt: "2026-09-30T12:00:00Z", comp };
  const unavailable = [
    { ...saved, id: "obsolete-map", comp: { ...comp, mapId: "retired-map" } },
    {
      ...saved,
      id: "obsolete-hero",
      comp: {
        ...comp,
        teams: {
          ...comp.teams,
          ally: comp.teams.ally.map((slot, index) =>
            index === 0 ? { ...slot, heroId: "retired-hero" } : slot,
          ),
        },
      },
    },
    {
      ...saved,
      id: "obsolete-rules",
      comp: {
        ...comp,
        draft: {
          ...emptyDraft("mrc"),
          teams: { ...emptyDraft("mrc").teams, ally: { ban: [], save: [] } },
        },
      },
    },
  ];
  await page.addInitScript(
    (comps) =>
      localStorage.setItem(
        "rivals-lab.comps.v1",
        JSON.stringify({
          version: 1,
          comps,
          recoveryNote: "Keep envelope metadata",
        }),
      ),
    [saved, ...unavailable],
  );
  await page.goto("/");
  await openBuilder(page);
  await expect(page.getByRole("alert")).toContainText(
    "3 saved comp(s) cannot be loaded",
  );
  await page
    .getByRole("button", { name: "Load Valid comp", exact: true })
    .click();
  await page.getByLabel("Comp notes", { exact: true }).fill("Still editable");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Valid comp.");
  await page
    .getByRole("button", { name: "Rename Valid comp", exact: true })
    .click();
  await page.getByRole("dialog").getByLabel("Comp name").fill("Renamed valid");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Renamed comp to Renamed valid.",
  );
  await page.getByRole("button", { name: "New comp", exact: true }).click();
  await page.getByLabel("Comp name", { exact: true }).fill("New valid");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved New valid.");
  await addCompCopies(
    page,
    {
      name: "valid.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ version: 1, comps: [saved] })),
    },
    1,
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete New valid", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Deleted New valid.");
  await page.reload();
  await openBuilder(page);
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "New valid",
  );
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Load Renamed valid", exact: true })
    .click();
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Still editable",
  );
  const source = await exportCompLibrary(page);
  // Compare external JSON as unknown; no cast can hide malformed stored data.
  const actual: unknown = JSON.parse(source);
  expect(actual).toMatchObject({
    version: 1,
    recoveryNote: "Keep envelope metadata",
    comps: expect.arrayContaining(unavailable),
  });
  expect(actual).toMatchObject({
    comps: expect.arrayContaining([
      {
        ...saved,
        comp: { ...comp, name: "Renamed valid", notes: "Still editable" },
        updatedAt: expect.any(String),
      },
    ]),
  });
  for (const recovery of [false, true])
    expect(await exportCompLibrary(page, recovery)).toBe(source);
});

for (const renameBeforeSave of [false, true]) {
  test(`stale tab preserves newer notes${renameBeforeSave ? " after library rename" : " with the same save timestamp"}`, async ({
    page,
    context,
  }) => {
    // Timestamp equality must not hide a content change.
    const time = new Date("2026-09-30T12:00:00Z");
    await page.clock.setFixedTime(time);
    await page.goto("/builder");
    await page.getByLabel("Comp name", { exact: true }).fill("Shared comp");
    await pickHero(page, "Allies slot 1: Choose hero", "Deadpool · Strategist");
    await page.getByLabel("Comp notes", { exact: true }).fill("Original notes");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved Shared comp.");
    const stale = await context.newPage();
    await stale.clock.setFixedTime(time);
    await stale.goto("/builder");
    await stale
      .getByRole("button", { name: "Load Shared comp", exact: true })
      .click();
    await page
      .getByLabel("Comp notes", { exact: true })
      .fill("New notes from tab A");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Saved Shared comp.");
    if (renameBeforeSave) {
      await stale
        .getByRole("button", { name: "Rename Shared comp", exact: true })
        .click();
      await stale
        .getByRole("dialog")
        .getByLabel("Comp name")
        .fill("Renamed comp");
      await stale
        .getByRole("button", { name: "Save name", exact: true })
        .click();
      await expect(stale.getByRole("status")).toHaveText(
        "Renamed comp to Renamed comp.",
      );
    } else {
      await stale.getByLabel("Comp name", { exact: true }).fill("Renamed comp");
    }
    const storedBefore = await exportCompLibrary(page);
    await stale.getByRole("button", { name: "Save", exact: true }).click();
    await expect(stale.getByRole("alert")).toContainText(
      "This comp changed in another tab",
    );
    await expect(stale.getByLabel("Comp name", { exact: true })).toHaveValue(
      "Renamed comp",
    );
    await expect(stale.getByLabel("Comp notes", { exact: true })).toHaveValue(
      "Original notes",
    );
    expect(await exportCompLibrary(page)).toBe(storedBefore);
    await stale.getByRole("button", { name: "Save As", exact: true }).click();
    await stale
      .getByRole("dialog")
      .getByLabel("Comp name")
      .fill("Recovered copy");
    await stale.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(stale.getByRole("status")).toHaveText("Saved Recovered copy.");
    await expect(stale.locator(".saved-comp")).toHaveCount(2);
    await stale
      .getByRole("button", {
        name: `Load ${renameBeforeSave ? "Renamed comp" : "Shared comp"}`,
        exact: true,
      })
      .click();
    await expect(stale.getByLabel("Comp notes", { exact: true })).toHaveValue(
      "New notes from tab A",
    );
    await stale
      .getByRole("button", { name: "Load Recovered copy", exact: true })
      .click();
    await expect(stale.getByLabel("Comp notes", { exact: true })).toHaveValue(
      "Original notes",
    );
    await stale
      .getByRole("button", { name: "Rename Recovered copy", exact: true })
      .click();
    await stale.getByRole("dialog").getByLabel("Comp name").fill("My copy");
    await stale.getByRole("button", { name: "Save name", exact: true }).click();
    await stale
      .getByLabel("Comp notes", { exact: true })
      .fill("Safe further edits");
    await stale.getByRole("button", { name: "Save", exact: true }).click();
    await expect(stale.getByRole("status")).toHaveText("Saved My copy.");
  });
}

test("stale tab cannot restore a deleted comp and can save its edits as a new copy", async ({
  page,
  context,
}) => {
  await page.goto("/builder");
  await page.getByLabel("Comp name", { exact: true }).fill("Deleted comp");
  await page.getByLabel("Comp notes", { exact: true }).fill("Original notes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Deleted comp.");
  const stale = await context.newPage();
  await stale.goto("/builder");
  await stale
    .getByRole("button", { name: "Load Deleted comp", exact: true })
    .click();
  await stale
    .getByLabel("Comp notes", { exact: true })
    .fill("Edits from tab B");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete Deleted comp", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Deleted Deleted comp.");
  const storedBefore = await readStoredCompLibrary(page);
  await stale.getByRole("button", { name: "Save", exact: true }).click();
  await expect(stale.getByRole("alert")).toContainText(
    "This comp was deleted in another tab",
  );
  await expect(stale.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Edits from tab B",
  );
  expect(await readStoredCompLibrary(page)).toBe(storedBefore);
  await expect(stale.locator(".saved-comp")).toHaveCount(0);
  await stale.getByRole("button", { name: "Save As", exact: true }).click();
  await stale
    .getByRole("dialog")
    .getByLabel("Comp name")
    .fill("Recovered comp");
  await stale.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(stale.getByRole("status")).toHaveText("Saved Recovered comp.");
  await stale.reload();
  await stale
    .getByRole("button", { name: "Load Recovered comp", exact: true })
    .click();
  await expect(stale.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Edits from tab B",
  );
  await expect(stale.locator(".saved-comp")).toHaveCount(1);
});
