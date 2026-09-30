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
  test(`${key} adds and removes a hero through the keyboard with one history edit per action`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    const add = page.getByRole("button", {
      name: "Add Angela to Allies",
      exact: true,
    });
    const remove = page.getByRole("button", {
      name: "Remove Angela from Allies",
      exact: true,
    });
    const allies = page.getByRole("button", { name: /^Allies/ });
    const opponents = page.getByRole("button", { name: /^Opponents/ });
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    await page.getByRole("searchbox").focus();
    await page.keyboard.press("Tab");
    await expect(add).toBeFocused();
    await expect(add).toHaveText("");
    await expect(add.locator("svg.lucide-plus")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await page.keyboard.press(key);
    await expect(allies).toHaveText("Allies 1");
    await expect(opponents).toHaveText("Opponents 0");
    await expect(page.locator(".selection-name strong")).toHaveText("Angela");
    await expect(page.locator(".coordinates")).toHaveText("x 52, y 52");
    await expect(remove).toBeEnabled();
    await expect(remove).toHaveText("");
    await expect(remove.locator("svg.lucide-trash-2")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await undo.click();
    await expect(allies).toHaveText("Allies 0");
    await expect(add).toBeEnabled();
    await redo.click();
    await expect(allies).toHaveText("Allies 1");
    await expect(redo).toBeDisabled();
    await remove.focus();
    await page.keyboard.press(key);
    await expect(allies).toHaveText("Allies 0");
    await expect(add).toBeEnabled();
    await expect(add).toBeFocused();
    await expect(page.locator(".selection-summary")).toHaveCount(0);
    const point = await boardPoint(page, 52, 52);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".selection-summary")).toHaveCount(0);
    await undo.click();
    await expect(allies).toHaveText("Allies 1");
    await expect(remove).toBeEnabled();
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".selection-name strong")).toHaveText("Angela");
    await expect(page.locator(".coordinates")).toHaveText("x 52, y 52");
    await redo.click();
    await expect(allies).toHaveText("Allies 0");
    await expect(add).toBeEnabled();
    await expect(redo).toBeDisabled();
    await expect(page.locator(".selection-summary")).toHaveCount(0);
  });
}

test("Add and Remove preserve other tokens and native row dragging", async ({
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
  const removeHulk = page.getByRole("button", {
    name: "Remove Hulk from Allies",
    exact: true,
  });
  await expect(removeHulk).toBeEnabled();
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
  await removeHulk.click();
  await expect(allies).toHaveText("Allies 1");
  await expect(
    page.getByRole("button", { name: "Add Hulk to Allies", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".selection-name strong")).toHaveText("Angela");
  await expect(page.locator(".coordinates")).toHaveText("x 52, y 52");
  const hulk = await boardPoint(page, 500, 250);
  await page.mouse.click(hulk.x, hulk.y);
  await expect(page.locator(".selection-summary")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(allies).toHaveText("Allies 2");
  await expect(removeHulk).toBeEnabled();
  await page.mouse.click(hulk.x, hulk.y);
  await expect(page.locator(".selection-name strong")).toHaveText("Hulk");
  await expect(page.locator(".coordinates")).toHaveText(moved);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(allies).toHaveText("Allies 1");
  await expect(page.locator(".selection-summary")).toHaveCount(0);
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

  test("tap adds and removes the same hero independently for each team with history", async ({
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
    const removeOpponent = page.getByRole("button", {
      name: "Remove Angela from Opponents",
      exact: true,
    });
    await expect(removeOpponent).toBeEnabled();
    await removeOpponent.tap();
    await expect(allies).toHaveText("Allies 4");
    await expect(opponents).toHaveText("Opponents 3");
    await expect(page.locator(".selection-summary")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Add Angela to Opponents",
        exact: true,
      }),
    ).toBeEnabled();
    await page.keyboard.press("Control+z");
    await expect(allies).toHaveText("Allies 4");
    await expect(opponents).toHaveText("Opponents 4");
    await expect(removeOpponent).toBeEnabled();
    await page.keyboard.press("Control+Shift+z");
    await expect(allies).toHaveText("Allies 4");
    await expect(opponents).toHaveText("Opponents 3");
    for (const hero of ["Magneto", "Magik", "Rocket Raccoon"]) {
      await expect(
        page.getByRole("button", {
          name: `Remove ${hero} from Opponents`,
          exact: true,
        }),
      ).toBeEnabled();
    }
    await allies.tap();
    for (const hero of ["Angela", "Doctor Strange", "Psylocke", "Luna Snow"]) {
      await expect(
        page.getByRole("button", {
          name: `Remove ${hero} from Allies`,
          exact: true,
        }),
      ).toBeEnabled();
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });
});
