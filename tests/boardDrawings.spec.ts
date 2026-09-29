import { expect, test, type Page } from "@playwright/test";

type DrawingKind = "arrow" | "zone" | "note";

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
async function click(
  page: Page,
  x: number,
  y: number,
  button: "left" | "right" = "left",
): Promise<void> {
  const position = await point(page, x, y);
  await page.mouse.click(position.x, position.y, { button });
}
async function drag(
  page: Page,
  x: number,
  y: number,
  endX: number,
  endY: number,
): Promise<void> {
  const start = await point(page, x, y);
  const end = await point(page, endX, endY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}
async function draw(page: Page, kind: DrawingKind): Promise<void> {
  await page
    .getByRole("button", {
      name:
        kind === "note"
          ? "Add note"
          : kind === "arrow"
            ? "Draw arrow"
            : "Draw zone",
      exact: true,
    })
    .click();
  if (kind === "note") await click(page, 400, 200);
  else await drag(page, 400, 200, 600, 300);
}
async function expectSelection(
  page: Page,
  kind: DrawingKind | null,
  x = 500,
  y = 250,
): Promise<void> {
  await click(page, x, y);
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    kind ? `${kind} selected.` : "Selection cleared.",
  );
}
async function remove(
  page: Page,
  kind: DrawingKind,
  x = 500,
  y = 250,
): Promise<void> {
  await click(page, x, y, "right");
  await page
    .getByRole("menuitem", { name: `Remove ${kind}`, exact: true })
    .click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}

test("pointer drawings move, resize with the map, and undo once per gesture", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page, "arrow");
  await expect(
    page.getByRole("group", { name: "Drawings on this map" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 1000, height: 800 });
  await drag(page, 500, 250, 560, 290);
  await expectSelection(page, null, 400, 200);
  await expectSelection(page, "arrow", 560, 290);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSelection(page, "arrow");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSelection(page, null);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Enter");
  for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowDown");
  await expectSelection(page, null);
  await expectSelection(page, "arrow", 500, 290);
  await remove(page, "arrow", 500, 290);
  await expectSelection(page, null, 500, 290);
});

test("map drawings are isolated; Clear and Reset preserve other maps", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page, "zone");
  const map = page.getByRole("combobox");
  await map.selectOption("hells-heaven-domination");
  await expectSelection(page, null);
  await draw(page, "arrow");
  await map.selectOption("birnin-tchalla-domination");
  await expectSelection(page, "zone");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 0",
  );
  await expectSelection(page, null);
  await map.selectOption("hells-heaven-domination");
  await expectSelection(page, "arrow");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 3",
  );
  await expectSelection(page, null);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSelection(page, "arrow");
});

test("keyboard selection and removal preserve note text editing", async ({
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
  await text.press("Control+z");
  await text.press("Control+Shift+z");
  await text.fill("Push here");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(text).toHaveValue("Push here");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(text).toHaveValue("New note");
  await page.getByLabel("Drawing color", { exact: true }).fill("#00ff00");
  await page.getByLabel("Drawing color", { exact: true }).fill("#ff0000");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Drawing color", { exact: true })).toHaveValue(
    "#ffd166",
  );
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menuitem", { name: "Remove note", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(text).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expectSelection(page, "note", 540, 315);
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Delete");
  await expect(text).toHaveCount(0);
});

test("cancelled drawing gestures do not enter history", async ({ page }) => {
  await page.goto("/");
  await draw(page, "arrow");
  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  for (const key of ["Escape", "Control+z"]) {
    const start = await point(page, 700, 150);
    const end = await point(page, 800, 250);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.keyboard.press(key);
    await page.mouse.up();
  }
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  await expectSelection(page, null, 750, 200);
  await expectSelection(page, null);
});

for (const width of [1280, 360]) {
  test(`drawing controls keep map bounds fixed at width ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const canvas = page.locator(".stage-host canvas").first();
    await point(page, 0, 0);
    const initial = await canvas.boundingBox();
    if (!initial) throw new Error("Missing board bounds");
    async function expectSameBounds(): Promise<void> {
      await point(page, 0, 0);
      expect(await canvas.boundingBox()).toEqual(initial);
    }
    for (const name of ["Draw arrow", "Draw zone", "Add note"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await expectSameBounds();
      await page
        .getByRole("button", { name: "Add at center", exact: true })
        .click();
      await expectSameBounds();
    }
    await page
      .getByRole("textbox", { name: "Note text", exact: true })
      .fill("Hold this area");
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    await expectSameBounds();
    await page.locator(".stage-host").focus();
    await page.keyboard.press("Delete");
    await expectSameBounds();
    await page.getByRole("button", { name: "Clear", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expectSameBounds();
  });
}

for (const kind of ["arrow", "zone", "note"] as const) {
  test(`${kind} drawings move directly and have a right-click remove menu`, async ({
    page,
  }) => {
    await page.goto("/");
    await draw(page, kind);
    await expect(
      page.getByRole("group", { name: "Drawings on this map" }),
    ).toHaveCount(0);
    await drag(page, 270, 435, 330, 475);
    await expect(page.locator(".selection-name strong")).toHaveText(
      "Doctor Strange",
    );
    await page.getByRole("button", { name: "Draw arrow", exact: true }).click();
    const x = kind === "note" ? 420 : 500;
    const y = kind === "note" ? 215 : 250;
    await expectSelection(page, kind, x, y);
    await drag(page, x, y, x + 40, y + 80);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expectSelection(page, kind, x, y);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await click(page, 270, 435);
    await expect(page.locator(".coordinates")).toHaveText("x 270, y 435");
    await remove(page, kind, x, y);
    await expectSelection(page, null, x, y);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expectSelection(page, kind, x, y);
    await click(page, x, y, "right");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await click(page, x, y, "right");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
}
