import { expect, test, type Page } from "@playwright/test";

async function boardPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  const bounds = await page.locator(".stage-host canvas").first().boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  const scale = bounds.width / 1200;
  return { x: bounds.x + x * scale, y: bounds.y + y * scale };
}

async function dropHero(
  page: Page,
  heroId: string,
  x: number,
  y: number,
): Promise<void> {
  const point = await boardPoint(page, x, y);
  const dataTransfer = await page.evaluateHandle((id) => {
    const data = new DataTransfer();
    data.setData("application/x-rivals-hero", id);
    data.setData("application/x-rivals-team", "ally");
    return data;
  }, heroId);
  await page.locator(".stage-host canvas").first().dispatchEvent("drop", {
    dataTransfer,
    clientX: point.x,
    clientY: point.y,
  });
  await dataTransfer.dispose();
}

async function clickToken(
  page: Page,
  x: number,
  y: number,
  button: "left" | "right" = "left",
): Promise<void> {
  // Canvas hit regions update on the next animation frame.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  const point = await boardPoint(page, x, y);
  await page.mouse.click(point.x, point.y, { button });
}

test("placement, removal, Clear and Reset restore in history order", async ({
  page,
}) => {
  await page.goto("/");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  const allies = page.getByRole("button", { name: /^Allies/ });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(undo).toBeDisabled();
  await dropHero(page, "hulk", 500, 250);
  await expect(allies).toHaveText("Allies 4");
  await dropHero(page, "hulk", 500, 250);
  await clickToken(page, 500, 250, "right");
  await page.getByRole("menuitem", { name: "Remove Hulk" }).click();
  await expect(allies).toHaveText("Allies 3");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(allies).toHaveText("Allies 0");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(allies).toHaveText("Allies 3");
  await undo.click();
  await expect(allies).toHaveText("Allies 0");
  await undo.click();
  await expect(allies).toHaveText("Allies 3");
  await undo.click();
  await expect(allies).toHaveText("Allies 4");
  await clickToken(page, 500, 250, "right");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(allies).toHaveText("Allies 3");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".selection-summary")).toHaveCount(0);
  await expect(undo).toBeDisabled();
  for (const count of [4, 3, 0, 3]) {
    await redo.click();
    await expect(allies).toHaveText(`Allies ${count}`);
  }
  await expect(redo).toBeDisabled();
});

test("one drag is one edit; selection and unchanged edits preserve redo", async ({
  page,
}) => {
  await page.goto("/");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  const start = await boardPoint(page, 270, 435);
  const end = await boardPoint(page, 350, 480);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(undo).toBeDisabled();
  await page.mouse.up();
  const moved = await page.locator(".coordinates").innerText();
  expect(moved).not.toBe("x 270, y 435");
  await undo.click();
  await expect(page.locator(".coordinates")).toHaveText("x 270, y 435");
  await expect(undo).toBeDisabled();
  await clickToken(page, 270, 435);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.move(start.x, start.y, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("combobox").selectOption("birnin-tchalla-domination");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  await redo.click();
  await clickToken(page, 350, 480);
  await expect(page.locator(".coordinates")).toHaveText(moved);
  await undo.click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(redo).toBeDisabled();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await undo.click();
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 3",
  );
  await expect(undo).toBeDisabled();
});

test("map changes restore clamped positions in the same step", async ({
  page,
}) => {
  await page.goto("/");
  const map = page.getByRole("combobox");
  await map.selectOption("museum-of-contemplation-convoy");
  await dropHero(page, "strange", 500, 700);
  await expect(page.locator(".coordinates")).toHaveText("x 500, y 636");
  await map.selectOption("birnin-tchalla-domination");
  await expect(page.locator(".coordinates")).toHaveText("x 500, y 632");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(map).toHaveValue("museum-of-contemplation-convoy");
  await expect(page.locator(".coordinates")).toHaveText("x 500, y 636");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(map).toHaveValue("birnin-tchalla-domination");
  await expect(page.locator(".coordinates")).toHaveText("x 500, y 632");
});

for (const modifier of ["Control", "Meta"]) {
  test(`${modifier} shortcuts preserve text editing and view state`, async ({
    page,
  }) => {
    await page.goto("/");
    await dropHero(page, "hulk", 500, 250);
    const search = page.getByRole("searchbox");
    await search.fill("Hulk");
    await search.press("Backspace");
    await expect(search).toHaveValue("Hul");
    await search.press(`${modifier}+z`);
    await search.press(`${modifier}+Shift+z`);
    await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
      "Allies 4",
    );
    // Both shortcuts must remain uncancelled in all text-editing surfaces.
    const prevented = await page.evaluate((key) => {
      const input = document.querySelector("input");
      if (!input) throw new Error("Missing search");
      const textarea = document.createElement("textarea");
      const editable = document.createElement("div");
      editable.contentEditable = "true";
      const child = document.createElement("span");
      editable.append(child);
      document.body.append(textarea, editable);
      const results = [input, textarea, child].flatMap((target) =>
        [false, true].map((shiftKey) => {
          const event = new KeyboardEvent("keydown", {
            key: "z",
            ctrlKey: key === "Control",
            metaKey: key === "Meta",
            shiftKey,
            bubbles: true,
            cancelable: true,
          });
          target.dispatchEvent(event);
          return event.defaultPrevented;
        }),
      );
      textarea.remove();
      editable.remove();
      return results;
    }, modifier);
    expect(prevented).toEqual([false, false, false, false, false, false]);
    await search.fill("Hulk");
    await page.getByRole("button", { name: /^Opponents/ }).click();
    await page.keyboard.press(`${modifier}+z`);
    await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
      "Allies 3",
    );
    await expect(page.locator(".selection-summary")).toHaveCount(0);
    await expect(search).toHaveValue("Hulk");
    await expect(
      page.getByRole("button", { name: /^Opponents/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press(`${modifier}+Shift+z`);
    await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
      "Allies 4",
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Redo", exact: true }),
    ).toBeDisabled();
  });
}

test("undo during a drag cancels the gesture without adding an edit", async ({
  page,
}) => {
  await page.goto("/");
  await dropHero(page, "hulk", 500, 250);
  const start = await boardPoint(page, 270, 435);
  const end = await boardPoint(page, 350, 480);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.keyboard.press("Control+z");
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".coordinates")).toHaveText("x 270, y 435");
  await clickToken(page, 270, 435);
  await expect(page.locator(".selection-name strong")).toHaveText(
    "Doctor Strange",
  );
});
