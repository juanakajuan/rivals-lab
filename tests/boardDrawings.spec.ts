import { expect, test, type Page } from "@playwright/test";

async function point(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const bounds = await page.locator(".stage-host canvas").first().boundingBox();
  if (!bounds) throw new Error("Missing board");
  return {
    x: bounds.x + (x * bounds.width) / 1200,
    y: bounds.y + (y * bounds.width) / 1200,
  };
}
async function draw(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
  const start = await point(page, 400, 200);
  const end = await point(page, 600, 300);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test("pointer drawings move, resize with the map, and undo once per gesture", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page, "Draw arrow");
  const arrow = page.getByRole("button", { name: "Arrow 1", exact: true });
  const actions = page.getByRole("group", { name: "Selected drawing actions" });
  await expect(arrow).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Select drawings", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1000, height: 800 });
  const start = await point(page, 500, 250);
  const end = await point(page, 560, 290);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  const oldStart = await point(page, 400, 200);
  await page.mouse.click(oldStart.x, oldStart.y);
  await expect(actions).toHaveCount(0);
  const movedCenter = await point(page, 560, 290);
  await page.mouse.click(movedCenter.x, movedCenter.y);
  await expect(actions).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const restoredCenter = await point(page, 500, 250);
  await page.mouse.click(restoredCenter.x, restoredCenter.y);
  await expect(actions).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(arrow).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await arrow.click();
  for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowDown");
  const oldCenter = await point(page, 500, 250);
  await page.mouse.click(oldCenter.x, oldCenter.y);
  await expect(actions).toHaveCount(0);
  const keyboardCenter = await point(page, 500, 290);
  await page.mouse.click(keyboardCenter.x, keyboardCenter.y);
  await expect(actions).toBeVisible();
  await page
    .getByRole("button", { name: "Remove drawing", exact: true })
    .click();
  await expect(arrow).toHaveCount(0);
  await draw(page, "Draw zone");
  await expect(
    page.getByRole("button", { name: "Zone 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move heroes", exact: true }).click();
  await expect(page.locator(".drawing-help")).toContainText(
    "Hero movement mode",
  );
});

test("map drawings are isolated; Clear and Reset preserve other maps", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page, "Draw zone");
  const map = page.getByRole("combobox");
  await map.selectOption("hells-heaven-domination");
  await expect(
    page.getByRole("group", { name: "Drawings on this map" }),
  ).toHaveCount(0);
  await draw(page, "Draw arrow");
  await map.selectOption("birnin-tchalla-domination");
  await expect(
    page.getByRole("button", { name: "Zone 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 0",
  );
  await expect(
    page.getByRole("group", { name: "Drawings on this map" }),
  ).toHaveCount(0);
  await map.selectOption("hells-heaven-domination");
  await expect(
    page.getByRole("button", { name: "Arrow 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 3",
  );
  await expect(
    page.getByRole("group", { name: "Drawings on this map" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Arrow 1", exact: true }),
  ).toBeVisible();
});

test("keyboard controls add and edit notes without board shortcuts", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add note", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Add at center", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  const text = page.getByRole("textbox", { name: "Note text", exact: true });
  await text.fill("Push here!");
  await text.press("Backspace");
  await expect(text).toHaveValue("Push here");
  await expect(
    page.getByRole("button", { name: "Note 1: New note", exact: true }),
  ).toBeVisible();
  await text.press("Control+z");
  await text.press("Control+Shift+z");
  await text.fill("Push here");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Note 1: Push here", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(text).toHaveValue("New note");
  await page.getByLabel("Drawing color", { exact: true }).fill("#00ff00");
  await page.getByLabel("Drawing color", { exact: true }).fill("#ff0000");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Drawing color", { exact: true })).toHaveValue(
    "#ffd166",
  );
  await page
    .getByRole("button", { name: "Note 1: New note", exact: true })
    .focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Delete");
  await expect(
    page.getByRole("group", { name: "Drawings on this map" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Note 1: New note", exact: true }),
  ).toBeVisible();
});

test("drawing mode protects heroes and cancelled gestures do not enter history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Draw arrow", exact: true }).click();
  const start = await point(page, 270, 435);
  const end = await point(page, 500, 300);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Arrow 1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Move heroes", exact: true }).click();
  const hero = await point(page, 270, 435);
  await page.mouse.click(hero.x, hero.y);
  await expect(page.locator(".coordinates")).toHaveText("x 270, y 435");
  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  const zoneStart = await point(page, 400, 200);
  const zoneEnd = await point(page, 600, 300);
  await page.mouse.move(zoneStart.x, zoneStart.y);
  await page.mouse.down();
  await page.mouse.move(zoneEnd.x, zoneEnd.y, { steps: 8 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /^Zone \d/ })).toHaveCount(0);
  await page.mouse.move(zoneStart.x, zoneStart.y);
  await page.mouse.down();
  await page.mouse.move(zoneEnd.x, zoneEnd.y, { steps: 8 });
  await page.keyboard.press("Control+z");
  await page.mouse.up();
  await expect(
    page.getByRole("group", { name: "Drawings on this map" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const note = await point(page, 600, 100);
  await page.mouse.click(note.x, note.y);
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toBeVisible();
});
