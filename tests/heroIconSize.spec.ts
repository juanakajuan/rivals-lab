import { expect, test, type Page } from "@playwright/test";

async function boardPoint(
  page: Page,
  x: number,
  y: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const bounds = await page.locator(".stage-host canvas").first().boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  const scale = bounds.width / 1200;
  return { x: bounds.x + x * scale, y: bounds.y + y * scale };
}

async function frame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function dropHero(
  page: Page,
  team: "ally" | "enemy",
  x: number,
  y: number,
): Promise<void> {
  const point = await boardPoint(page, x, y);
  const dataTransfer = await page.evaluateHandle((value) => {
    const data = new DataTransfer();
    data.setData("application/x-rivals-hero", "hulk");
    data.setData("application/x-rivals-team", value);
    return data;
  }, team);
  await page.locator(".stage-host canvas").first().dispatchEvent("drop", {
    dataTransfer,
    clientX: point.x,
    clientY: point.y,
  });
  await dataTransfer.dispose();
  await frame(page);
}

for (const width of [1280, 360]) {
  for (const size of [50, 150]) {
    test(`size ${size}% supports both teams and edges at width ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const slider = page.getByRole("slider", { name: "Hero icon size" });
      await expect(slider).toHaveAttribute("aria-valuenow", "100");
      await slider.focus();
      await slider.press(size === 50 ? "Home" : "End");
      await expect(slider).toHaveAttribute("aria-valuenow", String(size));
      await slider.press(size === 50 ? "ArrowLeft" : "ArrowRight");
      await expect(slider).toHaveAttribute("aria-valuenow", String(size));
      await expect(page.locator('[data-slot="slider-thumb"]')).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      const boundary = (24 * size) / 100;
      for (const team of ["ally", "enemy"] as const) {
        await dropHero(page, team, 0, 0);
        await expect(page.locator(".coordinates")).toHaveText(
          `x ${boundary}, y ${boundary}`,
        );
        const start = await boardPoint(page, boundary, boundary);
        const end = await boardPoint(page, 1200, 654);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 8 });
        await page.mouse.up();
        await expect(page.locator(".coordinates")).toHaveText(
          `x ${1200 - boundary}, y ${654 - boundary}`,
        );
        await frame(page);
        const token = await boardPoint(page, 1200 - boundary, 654 - boundary);
        await page.mouse.click(token.x, token.y, { button: "right" });
        await expect(
          page.getByRole("menu", { name: "Hulk actions" }),
        ).toBeVisible();
        await page.getByRole("menuitem", { name: "Remove Hulk" }).click();
        await expect(page.locator(".selection-summary")).toHaveCount(0);
      }
    });
  }
}

test("resizing and history restoration keep edge tokens inside the map", async ({
  page,
}) => {
  await page.goto("/");
  const slider = page.getByRole("slider", { name: "Hero icon size" });
  await slider.press("Home");
  await dropHero(page, "ally", 0, 0);
  await dropHero(page, "ally", 500, 300);
  const placedCoordinates = await page.locator(".coordinates").innerText();
  await slider.press("End");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".coordinates")).toHaveText("x 36, y 36");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".coordinates")).toHaveText(placedCoordinates);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await slider.press("Home");
  await expect(page.locator(".coordinates")).toHaveText("x 12, y 12");
  await slider.press("End");
  await expect(page.locator(".coordinates")).toHaveText("x 36, y 36");
  await frame(page);
  const point = await boardPoint(page, 36, 36);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press("Delete");
  await expect(page.locator(".selection-summary")).toHaveCount(0);
});
