import { expect, test, type Page } from "@playwright/test";

async function openBuilder(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Draft / Comp Builder", exact: true })
    .click();
}

async function pickHero(page: Page, slot: string, hero: string): Promise<void> {
  await page.getByRole("button", { name: slot, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: hero, exact: true })
    .click();
}

test("named comps, notes, copies and JSON imports survive reload without data loss", async ({
  page,
}) => {
  await page.goto("/");
  await openBuilder(page);
  await page.getByLabel("Comp name", { exact: true }).fill("Midtown dive");
  await page.getByLabel("Comp map", { exact: true }).selectOption("midtown");
  await pickHero(page, "Allies slot 1: Choose hero", "Doctor Strange");
  await pickHero(page, "Opponents slot 1: Choose hero", "Doctor Strange");
  await page.getByLabel("Allies slot 1 notes").fill("Hold the corner.");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Take high ground.\nSave portals for the rotation.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Midtown dive.");
  await page.reload();
  await openBuilder(page);
  await page
    .getByRole("button", { name: "Load Midtown dive", exact: true })
    .click();
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Take high ground.\nSave portals for the rotation.",
  );
  await expect(page.getByLabel("Allies slot 1 notes")).toHaveValue(
    "Hold the corner.",
  );
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
  const exported = await page.evaluate(() =>
    localStorage.getItem("rivals-lab.comps.v1"),
  );
  if (!exported) throw new Error("Missing saved library");
  await page
    .getByLabel("Import comps JSON")
    .setInputFiles({
      name: "comps.json",
      mimeType: "application/json",
      buffer: Buffer.from(exported),
    });
  await expect(page.getByRole("status")).toHaveText(
    "Imported 2 comps as copies.",
  );
  await expect(page.locator(".saved-comp")).toHaveCount(4);
  await page
    .getByLabel("Import comps JSON")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version": 99}'),
    });
  await expect(page.getByRole("alert")).toContainText(
    "Unsupported comp file version",
  );
  await expect(page.locator(".saved-comp")).toHaveCount(4);
});

test("guided bans, conflicts, joint phases and Undo enforce the draft rules", async ({
  page,
}) => {
  await page.goto("/");
  await openBuilder(page);
  await pickHero(page, "Allies slot 1: Choose hero", "Doctor Strange");
  await page.getByLabel("Draft format").selectOption("mrc");
  await pickHero(page, "Choose ban · Allies", "Doctor Strange");
  await expect(page.locator(".has-conflict")).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: "Allies slot 1: Doctor Strange",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Allies slot 2: Choose hero", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Doctor Strange — Banned for this team." }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".has-conflict")).toHaveCount(0);
  await page.getByLabel("Draft format").selectOption("ignite");
  await pickHero(page, "Choose ban · Allies", "Doctor Strange");
  await expect(page.locator(".joint-note")).toContainText("1 / 2");
  await expect(page.locator(".has-conflict")).toHaveCount(0);
  await pickHero(page, "Choose ban · Opponents", "Doctor Strange");
  await expect(page.locator(".has-conflict")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Allies save", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Choose save · Allies", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", {
        name: "Doctor Strange — Already banned for this team.",
      }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".joint-note")).toContainText("1 / 2");
  await expect(page.locator(".has-conflict")).toHaveCount(0);
});

test("board transfer requires a supported map and confirms replacement; edits stay in the builder", async ({
  page,
}) => {
  await page.goto("/");
  await openBuilder(page);
  await pickHero(page, "Allies slot 1: Choose hero", "Hulk");
  await pickHero(page, "Opponents slot 1: Choose hero", "Loki");
  await page.getByLabel("Comp map", { exact: true }).selectOption("midtown");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Preserve these notes.");
  await page.getByRole("button", { name: "Open on Position Board" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Midtown has no board image yet.",
  );
  await page
    .getByLabel("Board map", { exact: true })
    .selectOption("museum-of-contemplation-convoy");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Open board", exact: true }).click();
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
  await expect(page.getByRole("combobox")).toHaveValue(
    "birnin-tchalla-domination",
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
  await expect(page.getByRole("combobox")).toHaveValue(
    "museum-of-contemplation-convoy",
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
  await expect(page.getByLabel("Comp map", { exact: true })).toHaveValue(
    "midtown",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Preserve these notes.",
  );
  await page.getByLabel("Allies slot 1 notes").fill("abc");
  await page.getByLabel("Allies slot 1 notes").press("Backspace");
  await expect(page.getByLabel("Allies slot 1 notes")).toHaveValue("ab");
  await page
    .getByRole("button", { name: "Position Board", exact: true })
    .focus();
  await page.keyboard.press("Control+z");
  await page
    .getByRole("button", { name: "Position Board", exact: true })
    .click();
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
  expect(
    await page.evaluate(() => localStorage.getItem("rivals-lab.comps.v1")),
  ).toBe("broken saved data");
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
});

test("Deadpool role choices persist, transfer to the board, and obey hero limits", async ({
  page,
}) => {
  await page.goto("/");
  await openBuilder(page);
  await page.getByLabel("Comp name", { exact: true }).fill("Deadpool support");
  await page.getByLabel("Comp map").selectOption("museum-of-contemplation");
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
  const exported = await page.evaluate(() =>
    localStorage.getItem("rivals-lab.comps.v1"),
  );
  if (!exported) throw new Error("Missing saved library");
  await page
    .getByLabel("Import comps JSON")
    .setInputFiles({
      name: "deadpool.json",
      mimeType: "application/json",
      buffer: Buffer.from(exported),
    });
  await expect(page.getByRole("status")).toHaveText(
    "Imported 1 comp as copies.",
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
      page
        .getByRole("dialog")
        .getByRole("button", {
          name: `Deadpool · ${role} — Already on this team.`,
          exact: true,
        }),
    ).toBeDisabled();
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Draft format").selectOption("mrc");
  await pickHero(page, "Choose ban · Allies", "Deadpool");
  await expect(page.locator(".has-conflict")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Opponents slot 1: Choose hero", exact: true })
    .click();
  for (const role of ["Vanguard", "Duelist", "Strategist"]) {
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", {
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
