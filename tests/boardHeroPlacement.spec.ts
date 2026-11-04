import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_ICON_SIZE, tokenBoundary } from "../src/boardTokens";
import { TEAM_SIZE } from "../src/heroes";
import {
  boardGeometry,
  boardPoint,
  coordinatesText,
  type ClientPoint,
} from "./boardGeometry";
import { openExampleBoard } from "./boardSetup";

function addSpacing(iconSize: number): number {
  return tokenBoundary(iconSize) * 2 + 4;
}

async function canvasPoint(
  page: Page,
  fractionX: number,
  fractionY: number,
): Promise<ClientPoint> {
  const { width, height, scale } = await boardGeometry(page);
  return { x: width * fractionX * scale, y: height * fractionY * scale };
}

for (const key of ["Enter", "Space"]) {
  test(`${key} adds and removes a hero through the keyboard with one history edit per action`, async ({
    page,
  }) => {
    await page.goto("/");
    const spacing = addSpacing(DEFAULT_ICON_SIZE);
    const firstSlot = coordinatesText({ x: spacing, y: spacing });
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
    await expect(page.locator(".coordinates")).toHaveText(firstSlot);
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
    const point = await boardPoint(page, spacing, spacing);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".selection-summary")).toHaveCount(0);
    await undo.click();
    await expect(allies).toHaveText("Allies 1");
    await expect(remove).toBeEnabled();
    await page.mouse.click(point.x, point.y);
    await expect(page.locator(".selection-name strong")).toHaveText("Angela");
    await expect(page.locator(".coordinates")).toHaveText(firstSlot);
    await redo.click();
    await expect(allies).toHaveText("Allies 0");
    await expect(add).toBeEnabled();
    await expect(redo).toBeDisabled();
    await expect(page.locator(".selection-summary")).toHaveCount(0);
  });
}

test("six per team disables Add and rejects new drops while allowing moves and removal", async ({
  page,
}) => {
  await page.goto("/board");
  const canvas = page.locator(".stage-host canvas").last();
  for (const label of ["Allies", "Opponents"]) {
    const team = page.getByRole("button", { name: new RegExp(`^${label}`) });
    await team.click();
    for (let index = 0; index < TEAM_SIZE; index++) {
      await page
        .getByRole("button", { name: new RegExp(`^Add .+ to ${label}$`) })
        .first()
        .click();
    }
    await expect(team).toHaveText(`${label} 6`);
    const adds = page.getByRole("button", {
      name: new RegExp(`^Add .+ to ${label}$`),
    });
    for (const add of await adds.all()) await expect(add).toBeDisabled();
    const newRow = adds.first().locator("..");
    await newRow.dragTo(canvas, {
      sourcePosition: { x: 60, y: 21 },
      targetPosition: await canvasPoint(page, 0.5, 0.3),
    });
    await expect(team).toHaveText(`${label} 6`);
    await expect(page.locator("[aria-live='polite']")).toHaveText(
      `${label} is full (6 heroes). Remove a hero first.`,
    );
    const angela = page.getByRole("button", {
      name: `Remove Angela from ${label}`,
      exact: true,
    });
    await angela.locator("..").dragTo(canvas, {
      sourcePosition: { x: 60, y: 21 },
      targetPosition: await canvasPoint(page, 0.55, 0.35),
    });
    await expect(page.locator(".selection-name strong")).toHaveText("Angela");
    await expect(team).toHaveText(`${label} 6`);
    await angela.click();
    await expect(adds.first()).toBeEnabled();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(adds.first()).toBeDisabled();
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(adds.first()).toBeEnabled();
    await adds.first().click();
    await expect(team).toHaveText(`${label} 6`);
  }
  await page.reload();
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 6",
  );
  await expect(page.getByRole("button", { name: /^Opponents/ })).toHaveText(
    "Opponents 6",
  );
});

test("Add and Remove preserve other tokens and native row dragging", async ({
  page,
}) => {
  await page.goto("/");
  const spacing = addSpacing(DEFAULT_ICON_SIZE);
  const angelaSlot = { x: spacing, y: spacing };
  const hulkSlot = coordinatesText({ x: spacing * 2, y: spacing });
  const allies = page.getByRole("button", { name: /^Allies/ });
  await page
    .getByRole("button", { name: "Add Angela to Allies", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Hulk to Allies", exact: true })
    .click();
  await expect(allies).toHaveText("Allies 2");
  await expect(page.locator(".coordinates")).toHaveText(hulkSlot);
  const canvas = page.locator(".stage-host canvas").last();
  const map = await boardGeometry(page);
  const target = {
    x: Math.round(map.width * 0.6),
    y: Math.round(map.height * 0.4),
  };
  const hulkRow = page
    .locator(".hero-row")
    .filter({ has: page.locator("strong", { hasText: /^Hulk$/ }) });
  await hulkRow.dragTo(canvas, {
    sourcePosition: { x: 60, y: 21 },
    targetPosition: { x: target.x * map.scale, y: target.y * map.scale },
  });
  await expect(allies).toHaveText("Allies 2");
  const moved = await page.locator(".coordinates").innerText();
  const coordinates = /^x (\d+), y (\d+)$/.exec(moved);
  if (!coordinates?.[1] || !coordinates[2])
    throw new Error("Missing token coordinates");
  const tolerance = Math.ceil(1 / map.scale);
  expect(Math.abs(Number(coordinates[1]) - target.x)).toBeLessThanOrEqual(
    tolerance,
  );
  expect(Math.abs(Number(coordinates[2]) - target.y)).toBeLessThanOrEqual(
    tolerance,
  );
  const removeHulk = page.getByRole("button", {
    name: "Remove Hulk from Allies",
    exact: true,
  });
  await expect(removeHulk).toBeEnabled();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".coordinates")).toHaveText(hulkSlot);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".coordinates")).toHaveText(moved);
  const angela = await boardPoint(page, angelaSlot.x, angelaSlot.y);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.mouse.click(angela.x, angela.y);
  await expect(page.locator(".selection-name strong")).toHaveText("Angela");
  await expect(page.locator(".coordinates")).toHaveText(
    coordinatesText(angelaSlot),
  );
  await removeHulk.click();
  await expect(allies).toHaveText("Allies 1");
  await expect(
    page.getByRole("button", { name: "Add Hulk to Allies", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".selection-name strong")).toHaveText("Angela");
  await expect(page.locator(".coordinates")).toHaveText(
    coordinatesText(angelaSlot),
  );
  const hulk = await boardPoint(page, target.x, target.y);
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
  await expect(page.locator(".coordinates")).toHaveText(
    coordinatesText(angelaSlot),
  );
});

for (const { iconSize, count } of [
  { iconSize: 140, count: TEAM_SIZE },
  { iconSize: 150, count: TEAM_SIZE },
]) {
  test(`${iconSize}% keeps ${count} added heroes apart and preserves positions`, async ({
    page,
  }) => {
    await page.goto("/");
    const size = page.getByRole("slider", { name: "Hero icon size" });
    await size.press("End");
    if (iconSize === 140) await size.press("ArrowLeft");
    await expect(size).toHaveValue(String(iconSize));
    const boundary = tokenBoundary(iconSize);
    const map = await boardGeometry(page);
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
      expect(x).toBeLessThanOrEqual(map.width - boundary);
      expect(y).toBeGreaterThanOrEqual(boundary);
      expect(y).toBeLessThanOrEqual(map.height - boundary);
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
    await openExampleBoard(page);
    const allies = page.getByRole("button", { name: /^Allies/ });
    const opponents = page.getByRole("button", { name: /^Opponents/ });
    const size = page.getByRole("slider", { name: "Hero icon size" });
    await size.press("End");
    const spacing = addSpacing(Number(await size.inputValue()));
    const { width } = await boardGeometry(page);
    await page
      .getByRole("button", { name: "Add Angela to Allies", exact: true })
      .tap();
    await expect(allies).toHaveText("Allies 4");
    await expect(opponents).toHaveText("Opponents 3");
    await expect(page.locator(".coordinates")).toHaveText(
      coordinatesText({ x: spacing, y: spacing }),
    );
    await opponents.tap();
    await page
      .getByRole("button", { name: "Add Angela to Opponents", exact: true })
      .tap();
    await expect(allies).toHaveText("Allies 4");
    await expect(opponents).toHaveText("Opponents 4");
    await expect(page.locator(".coordinates")).toHaveText(
      coordinatesText({ x: Math.floor(width / 2) + spacing, y: spacing }),
    );
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

test.describe("small phone layout", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 812 },
  });

  test("the map stays in view while the user adds a hero from the end of the list", async ({
    page,
  }) => {
    await page.goto("/");
    const add = page.getByRole("button", {
      name: "Add Deadpool to Allies",
      exact: true,
    });
    await add.scrollIntoViewIfNeeded();
    await add.tap();
    await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
      "Allies 1",
    );
    await expect(page.locator(".selection-name strong")).toHaveText("Deadpool");
    await expect(page.locator(".stage-host canvas").first()).toBeInViewport({
      ratio: 1,
    });
    await expect(
      page.getByRole("button", {
        name: "Remove Deadpool from Allies",
        exact: true,
      }),
    ).toBeInViewport({ ratio: 1 });
  });
});
