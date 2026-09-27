import { expect, test, type Page } from "@playwright/test";
import type {} from "./fixtures/board.ts";

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
      await expect(slider).toHaveValue("100");
      await slider.focus();
      await slider.press(size === 50 ? "Home" : "End");
      await expect(slider).toHaveValue(String(size));
      await slider.press(size === 50 ? "ArrowLeft" : "ArrowRight");
      await expect(slider).toHaveValue(String(size));
      await expect(slider).toBeInViewport();
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

test("existing and new portraits and rings scale together after delayed image loading", async ({
  page,
}) => {
  let releaseImages: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    releaseImages = resolve;
  });
  await page.route("**/hero-icons/**", async (route) => {
    await ready;
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#00ff00"/></svg>',
    });
  });
  await page.goto("/tests/fixtures/board.html", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(window.boardHarness));
  await page.evaluate(() => {
    const harness = window.boardHarness;
    harness.snapshot = { ...harness.snapshot, iconSize: 150 };
    harness.board.update(harness.snapshot);
  });
  releaseImages();
  await page.waitForLoadState("networkidle");
  for (const size of [150, 50]) {
    await page.evaluate((iconSize) => {
      const harness = window.boardHarness;
      const existing = harness.snapshot.tokens[0];
      if (!existing) throw new Error("Missing existing token");
      harness.snapshot = {
        ...harness.snapshot,
        iconSize,
        tokens: [
          existing,
          { id: "enemy-hulk", heroId: "hulk", team: "enemy", x: 400, y: 200 },
        ],
      };
      harness.board.update(harness.snapshot);
    }, size);
    await frame(page);
    const pixels = await page
      .locator("#board canvas")
      .last()
      .evaluate((canvas, iconSize) => {
        if (!(canvas instanceof HTMLCanvasElement))
          throw new Error("Missing canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Missing context");
        return [100, 200].map((center) => {
          const pixel = (offset: number) => [
            ...context.getImageData(Math.floor(center + offset), 100, 1, 1)
              .data,
          ];
          return {
            portrait: pixel((10 * iconSize) / 100 / 2),
            ring: pixel((22 * iconSize) / 100 / 2),
            outside: pixel((25 * iconSize) / 100 / 2 + 1),
          };
        });
      }, size);
    expect(pixels).toHaveLength(2);
    for (const pixel of pixels) {
      expect(pixel.portrait).toEqual([0, 255, 0, 255]);
      expect(pixel.ring[3]).toBeGreaterThan(0);
      expect(pixel.ring.slice(0, 3)).not.toEqual([0, 255, 0]);
      expect(pixel.outside[3]).toBe(0);
    }
  }
});
