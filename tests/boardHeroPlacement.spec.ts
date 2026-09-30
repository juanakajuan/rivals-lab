import { expect, test, type Page } from "@playwright/test";
import { HEROES } from "../src/heroes";

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

for (const key of ["Enter", "Space"]) {
  test(`${key} adds a hero through the keyboard and records one history edit`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    const add = page.getByRole("button", {
      name: "Add Angela to Allies",
      exact: true,
    });
    const allies = page.getByRole("button", { name: /^Allies/ });
    const opponents = page.getByRole("button", { name: /^Opponents/ });
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    await page.getByRole("searchbox").focus();
    await page.keyboard.press("Tab");
    await expect(add).toBeFocused();
    await expect(add).toHaveText("Add");
    await page.keyboard.press(key);
    await expect(allies).toHaveText("Allies 1");
    await expect(opponents).toHaveText("Opponents 0");
    await expect(page.locator(".selection-name strong")).toHaveText("Angela");
    await expect(page.locator(".coordinates")).toHaveText("x 52, y 52");
    await expect(
      page.getByRole("button", { name: "Added Angela to Allies", exact: true }),
    ).toBeDisabled();
    await undo.click();
    await expect(allies).toHaveText("Allies 0");
    await expect(add).toBeEnabled();
    await redo.click();
    await expect(allies).toHaveText("Allies 1");
    await expect(redo).toBeDisabled();
  });
}

test("Add leaves other tokens in place, spaces new tokens, and preserves native row dragging", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  const allies = page.getByRole("button", { name: /^Allies/ });
  await page
    .getByRole("button", { name: "Add Angela to Allies", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Hulk to Allies", exact: true })
    .click();
  await expect(allies).toHaveText("Allies 2");
  await expect(page.locator(".coordinates")).toHaveText("x 104, y 52");
  const canvas = page.locator(".stage-host canvas").last();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  const hulkRow = page
    .locator(".hero-row")
    .filter({ has: page.locator("strong", { hasText: /^Hulk$/ }) });
  await hulkRow.dragTo(canvas, {
    sourcePosition: { x: 60, y: 21 },
    targetPosition: {
      x: (500 * bounds.width) / 1200,
      y: (250 * bounds.width) / 1200,
    },
  });
  await expect(allies).toHaveText("Allies 2");
  await expect(page.locator(".coordinates")).toHaveText(
    /^x (499|500|501), y (249|250|251)$/,
  );
  const moved = await page.locator(".coordinates").innerText();
  await expect(
    page.getByRole("button", { name: "Added Hulk to Allies", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".coordinates")).toHaveText("x 104, y 52");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".coordinates")).toHaveText(moved);
  const angela = await boardPoint(page, 52, 52);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.mouse.click(angela.x, angela.y);
  await expect(page.locator(".selection-name strong")).toHaveText("Angela");
  await expect(page.locator(".coordinates")).toHaveText("x 52, y 52");
});

for (const { iconSize, count } of [
  { iconSize: 140, count: 18 },
  { iconSize: 150, count: HEROES.length },
]) {
  test(`${iconSize}% keeps ${count} added heroes apart and preserves positions`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    const size = page.getByRole("slider", { name: "Hero icon size" });
    await size.press("End");
    if (iconSize === 140) await size.press("ArrowLeft");
    await expect(size).toHaveValue(String(iconSize));
    const boundary = Math.ceil((24 * iconSize) / 100);
    const placements: {
      readonly hero: string;
      readonly x: number;
      readonly y: number;
      readonly coordinates: string;
    }[] = [];
    for (let index = 0; index < count; index += 1) {
      await page
        .getByRole("button", { name: /^Add .+ to Allies$/ })
        .first()
        .click();
      const hero = await page.locator(".selection-name strong").innerText();
      const coordinates = await page.locator(".coordinates").innerText();
      const match = /^x (\d+), y (\d+)$/.exec(coordinates);
      const x = Number(match?.[1]);
      const y = Number(match?.[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y))
        throw new Error(`Invalid board coordinates: ${coordinates}`);
      expect(x).toBeGreaterThanOrEqual(boundary);
      expect(x).toBeLessThanOrEqual(1200 - boundary);
      expect(y).toBeGreaterThanOrEqual(boundary);
      expect(y).toBeLessThanOrEqual(654 - boundary);
      for (const previous of placements) {
        expect(
          Math.hypot(x - previous.x, y - previous.y),
          `${hero} must not overlap ${previous.hero}`,
        ).toBeGreaterThanOrEqual(boundary * 2);
      }
      placements.push({ hero, x, y, coordinates });
    }
    await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
      `Allies ${count}`,
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    for (const placement of placements) {
      const point = await boardPoint(page, placement.x, placement.y);
      await page.mouse.click(point.x, point.y);
      await expect(page.locator(".selection-name strong")).toHaveText(
        placement.hero,
      );
      await expect(page.locator(".coordinates")).toHaveText(
        placement.coordinates,
      );
    }
  });
}

test.describe("touch placement", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("tap adds the same hero independently for each team and works with history", async ({
    page,
  }) => {
    await page.goto("/");
    const allies = page.getByRole("button", { name: /^Allies/ });
    const opponents = page.getByRole("button", { name: /^Opponents/ });
    await page.getByRole("slider", { name: "Hero icon size" }).press("End");
    await page
      .getByRole("button", { name: "Add Angela to Allies", exact: true })
      .tap();
    await expect(allies).toHaveText("Allies 4");
    await expect(opponents).toHaveText("Opponents 3");
    await expect(page.locator(".coordinates")).toHaveText("x 76, y 76");
    await opponents.tap();
    await page
      .getByRole("button", { name: "Add Angela to Opponents", exact: true })
      .tap();
    await expect(allies).toHaveText("Allies 4");
    await expect(opponents).toHaveText("Opponents 4");
    await expect(page.locator(".coordinates")).toHaveText("x 676, y 76");
    await expect(
      page.getByRole("button", {
        name: "Added Angela to Opponents",
        exact: true,
      }),
    ).toBeDisabled();
    await page.keyboard.press("Control+z");
    await expect(allies).toHaveText("Allies 4");
    await expect(opponents).toHaveText("Opponents 3");
    await expect(
      page.getByRole("button", {
        name: "Add Angela to Opponents",
        exact: true,
      }),
    ).toBeEnabled();
    await page.keyboard.press("Control+Shift+z");
    await expect(opponents).toHaveText("Opponents 4");
    await allies.tap();
    await expect(
      page.getByRole("button", { name: "Added Angela to Allies", exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
});
