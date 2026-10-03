import { expect, test, type Page } from "@playwright/test";
import type Konva from "konva";

declare global {
  interface Window {
    readonly Konva?: typeof Konva;
  }
}

type NoteLayout = ReturnType<Konva.Text["getClientRect"]> & {
  readonly text: string;
  readonly boardWidth: number;
  readonly boardHeight: number;
};

async function noteLayout(
  page: Page,
  expectedText: string,
): Promise<NoteLayout> {
  await point(page, 0, 0);
  return page.evaluate((expectedText) => {
    const konva = window.Konva;
    if (!konva) throw new Error("Missing Konva");
    const stage = konva.stages.find((stage) =>
      stage.container().matches(".stage-host"),
    );
    if (!stage) throw new Error("Missing board stage");
    const note = stage
      .find("Text")
      .find(
        (node) => node instanceof konva.Text && node.text() === expectedText,
      );
    if (!(note instanceof konva.Text)) throw new Error("Missing rendered note");
    return {
      ...note.getClientRect({
        relativeTo: stage,
        skipStroke: true,
        skipShadow: true,
      }),
      text: note.text(),
      boardWidth: stage.width() / stage.scaleX(),
      boardHeight: stage.height() / stage.scaleY(),
    };
  }, expectedText);
}

function expectNoteInsideBoard(note: NoteLayout): void {
  expect(note.x).toBeGreaterThanOrEqual(0);
  expect(note.y).toBeGreaterThanOrEqual(0);
  expect(note.x + note.width).toBeLessThanOrEqual(note.boardWidth + 0.5);
  expect(note.y + note.height).toBeLessThanOrEqual(note.boardHeight + 0.5);
}

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
  if (kind === null)
    await page.getByRole("button", { name: "Move", exact: true }).click();
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
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Choose map", exact: true })
      .getByRole("button", { pressed: true }),
  ).toBeFocused();
  await page
    .getByRole("dialog", { name: "Choose map", exact: true })
    .getByRole("button", {
      name: "Hydra Charteris Base: Hell's Heaven",
      exact: true,
    })
    .click();
  await expectSelection(page, null);
  await draw(page, "arrow");
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Choose map", exact: true })
      .getByRole("button", { pressed: true }),
  ).toBeFocused();
  await page
    .getByRole("dialog", { name: "Choose map", exact: true })
    .getByRole("button", {
      name: "Intergalactic Empire of Wakanda: Birnin T'Challa",
      exact: true,
    })
    .click();
  await expectSelection(page, "zone");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 0",
  );
  await expectSelection(page, null);
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Choose map", exact: true })
      .getByRole("button", { pressed: true }),
  ).toBeFocused();
  await page
    .getByRole("dialog", { name: "Choose map", exact: true })
    .getByRole("button", {
      name: "Hydra Charteris Base: Hell's Heaven",
      exact: true,
    })
    .click();
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
  const colorButton = page.getByRole("button", {
    name: "Drawing color",
    exact: true,
  });
  const hexColor = page.getByRole("textbox", {
    name: "Hex color",
    exact: true,
  });
  await colorButton.click();
  await hexColor.fill("invalid");
  await expect(
    page.getByRole("button", { name: "Apply", exact: true }),
  ).toBeDisabled();
  await hexColor.fill("#00ff00");
  await hexColor.fill("#ff0000");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await colorButton.click();
  await expect(hexColor).toHaveValue("#ffd166");
  await page.getByRole("button", { name: "Blue", exact: true }).click();
  await hexColor.press("Escape");
  await expect(colorButton).toBeFocused();
  await colorButton.click();
  await expect(hexColor).toHaveValue("#ffd166");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
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
    const toolButton = page.getByRole("button", {
      name:
        kind === "note"
          ? "Add note"
          : kind === "arrow"
            ? "Draw arrow"
            : "Draw zone",
      exact: true,
    });
    await expect(toolButton).toHaveAttribute("aria-pressed", "true");
    if (kind === "note") await click(page, 700, 100);
    else await drag(page, 700, 100, 850, 150);
    await expect(toolButton).toHaveAttribute("aria-pressed", "true");
    await expectSelection(
      page,
      kind,
      kind === "note" ? 720 : 775,
      kind === "note" ? 115 : 125,
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(toolButton).toHaveAttribute("aria-pressed", "true");
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

for (const { name, text } of [
  {
    name: "eight lines",
    text: "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8",
  },
  {
    name: "wrapped text",
    text: "Hold the point and watch the left flank. Wait for the team before moving forward. Keep cover near the objective and regroup here when the enemy pushes.",
  },
]) {
  test(`notes with ${name} stay inside the map after pointer and keyboard movement`, async ({
    page,
  }) => {
    await page.goto("/");
    await draw(page, "note");
    await page
      .getByRole("textbox", { name: "Note text", exact: true })
      .fill(text);
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    const before = await noteLayout(page, text);
    await drag(page, before.x + 20, before.y + 15, before.x + 20, 640);
    const moved = await noteLayout(page, text);
    expect(moved.y).toBeGreaterThan(before.y);
    expectNoteInsideBoard(moved);
    await page.locator(".stage-host").focus();
    for (let step = 0; step < 20; step++)
      await page.keyboard.press("ArrowDown");
    expectNoteInsideBoard(await noteLayout(page, text));
  });

  test(`expanding a note to ${name} at the bottom keeps text and position in one undo step`, async ({
    page,
  }) => {
    await page.goto("/");
    await draw(page, "note");
    await drag(page, 420, 215, 420, 640);
    const before = await noteLayout(page, "New note");
    const editor = page.getByRole("textbox", {
      name: "Note text",
      exact: true,
    });
    await editor.fill(text);
    await page.getByRole("button", { name: "Save note", exact: true }).click();
    const expanded = await noteLayout(page, text);
    expectNoteInsideBoard(expanded);
    expect(expanded.y).toBeLessThan(before.y);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(editor).toHaveValue("New note");
    expect(await noteLayout(page, "New note")).toEqual(before);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(editor).toHaveValue(text);
    expect(await noteLayout(page, text)).toEqual(expanded);
  });
}

test("color drafts stay local through composing Escape and page changes", async ({
  page,
}) => {
  await page.goto("/");
  await draw(page, "note");
  const color = page.getByRole("button", {
    name: "Drawing color",
    exact: true,
  });
  const popup = page.getByRole("dialog", {
    name: "Choose drawing color",
    exact: true,
  });
  const hex = popup.getByRole("textbox", { name: "Hex color", exact: true });
  await color.click();
  await expect(hex).toBeFocused();
  await hex.fill("#AB12EF");
  await hex.dispatchEvent("keydown", {
    key: "Escape",
    code: "Escape",
    isComposing: true,
    bubbles: true,
    cancelable: true,
  });
  await expect(popup).toBeVisible();
  await popup.getByRole("button", { name: "Blue", exact: true }).focus();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(color).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveValue("New note");
  await color.click();
  await expect(hex).toHaveValue("#ffd166");
  await hex.fill("#AB12EF");
  await popup.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await color.click();
  await expect(hex).toHaveValue("#ab12ef");
  await popup.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await color.click();
  await expect(hex).toHaveValue("#ffd166");
  await hex.fill("#123456");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await expect(popup).toHaveCount(0);
  await page.getByRole("link", { name: "Position Board", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await color.click();
  await expect(hex).toHaveValue("#ffd166");
});
