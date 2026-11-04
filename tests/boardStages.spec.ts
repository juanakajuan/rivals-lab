import { expect, test, type Locator, type Page } from "@playwright/test";
import type Konva from "konva";
import { scaledSize } from "../src/boardMaps";
import { clampToBoard, tokenBoundary } from "../src/boardTokens";
import { DEFAULT_MAP_ID, findBoardMap } from "../src/maps";
import {
  boardGeometry,
  boardPoint,
  coordinatesText,
  defaultToken,
  type BoardGeometry,
} from "./boardGeometry";

declare global {
  interface Window {
    readonly Konva?: typeof Konva;
  }
}

type Rgba = readonly [number, number, number, number];

const ICON_SIZE = 100;
const BOARD_BACKGROUND = "rgb(17, 18, 20)";
const OPAQUE_BLACK: Rgba = [0, 0, 0, 255];
const SHELL_COLOR: Rgba = [17, 18, 20, 255];

function catalogBoard(
  id: string,
): NonNullable<ReturnType<typeof findBoardMap>> {
  const board = findBoardMap(id);
  if (!board) throw new Error(`${id} is not in the map catalog`);
  return board;
}

const DEFAULT = catalogBoard(DEFAULT_MAP_ID);
const SPACEPORT = catalogBoard("birnin-tchalla-spaceport");
const STAGE_NAMES = [
  "Imperial Institute of Science",
  "Spaceport",
  "Waterfall",
] as const;

function stageGroup(page: Page): Locator {
  return page.getByRole("group", { name: "Stage", exact: true });
}

function stageButton(page: Page, name: string): Locator {
  return stageGroup(page).getByRole("button", { name, exact: true });
}

async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function mapImageSize(
  page: Page,
): Promise<{ readonly width: number; readonly height: number }> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stage = window.Konva?.stages.find((item) =>
          item.container().matches(".stage-host"),
        );
        return stage?.getLayers()[0]?.findOne("Image") !== undefined;
      }),
    )
    .toBe(true);
  return page.evaluate(() => {
    const stage = window.Konva?.stages.find((item) =>
      item.container().matches(".stage-host"),
    );
    const image = stage?.getLayers()[0]?.findOne("Image");
    if (!image) throw new Error("Missing map image");
    return { width: image.width(), height: image.height() };
  });
}

async function expectBoardSize(
  page: Page,
  size: { readonly width: number; readonly height: number },
): Promise<BoardGeometry> {
  await settled(page);
  const geometry = await boardGeometry(page);
  expect(geometry.width).toBeCloseTo(size.width);
  expect(geometry.height).toBeCloseTo(size.height);
  expect(geometry.bounds.width / geometry.bounds.height).toBeCloseTo(
    size.width / size.height,
    2,
  );
  const image = await mapImageSize(page);
  expect(image.width).toBeCloseTo(size.width);
  expect(image.height).toBeCloseTo(size.height);
  return geometry;
}

async function mapCanvasCorner(page: Page): Promise<{
  readonly cornerAlpha: number;
  readonly maxAlpha: number;
  readonly opaqueBlack: number;
}> {
  return page.evaluate((black) => {
    const canvas = document.querySelector(".stage-host canvas");
    if (!(canvas instanceof HTMLCanvasElement))
      throw new Error("Missing map canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing map context");
    const width = Math.floor(canvas.width * 0.05);
    const height = Math.floor(canvas.height * 0.05);
    const data = context.getImageData(0, 0, width, height).data;
    let maxAlpha = 0;
    let opaqueBlack = 0;
    for (let index = 0; index < data.length; index += 4) {
      maxAlpha = Math.max(maxAlpha, data[index + 3] ?? 0);
      if (
        [0, 1, 2, 3].every((offset) => data[index + offset] === black[offset])
      )
        opaqueBlack += 1;
    }
    return { cornerAlpha: data[3] ?? -1, maxAlpha, opaqueBlack };
  }, OPAQUE_BLACK);
}

async function screenColor(page: Page, x: number, y: number): Promise<Rgba> {
  const png = await page.screenshot({
    clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 },
  });
  const [red = -1, green = -1, blue = -1, alpha = -1] = await page.evaluate(
    async (source) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Missing sample context");
      context.drawImage(image, 0, 0);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    },
    `data:image/png;base64,${png.toString("base64")}`,
  );
  return [red, green, blue, alpha];
}

async function expectTransparentCornerShowsBoard(page: Page): Promise<void> {
  const corner = await mapCanvasCorner(page);
  expect(corner.cornerAlpha).toBe(0);
  expect(corner.maxAlpha).toBe(0);
  expect(corner.opaqueBlack).toBe(0);
  await expect(page.locator(".board-shell")).toHaveCSS(
    "background-color",
    BOARD_BACKGROUND,
  );
  const geometry = await boardGeometry(page);
  const sample = await boardPoint(
    page,
    geometry.width * 0.02,
    geometry.height * 0.02,
  );
  expect(await screenColor(page, sample.x, sample.y)).toEqual(SHELL_COLOR);
}

async function dropHero(
  page: Page,
  heroName: string,
  fractionX: number,
  fractionY: number,
): Promise<void> {
  const canvas = page.locator(".stage-host canvas").last();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  await page
    .locator(".hero-row")
    .filter({ has: page.locator("strong", { hasText: heroName }) })
    .first()
    .dragTo(canvas, {
      sourcePosition: { x: 60, y: 21 },
      targetPosition: {
        x: bounds.width * fractionX,
        y: bounds.height * fractionY,
      },
    });
}

async function expectClampedDrop(
  page: Page,
  heroName: string,
  fractionX: number,
  fractionY: number,
): Promise<void> {
  const geometry = await boardGeometry(page);
  await dropHero(page, heroName, fractionX, fractionY);
  await expect(page.locator(".selection-name strong")).toHaveText(heroName);
  await expect(page.locator(".coordinates")).toHaveText(
    coordinatesText(
      clampToBoard(
        { x: geometry.width * fractionX, y: geometry.height * fractionY },
        geometry,
        ICON_SIZE,
      ),
    ),
  );
}

async function selectNextDrawing(page: Page): Promise<void> {
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Enter");
}

async function tokenPositions(
  page: Page,
): Promise<readonly { readonly x: number; readonly y: number }[]> {
  await settled(page);
  return page.evaluate(() => {
    const stage = window.Konva?.stages.find((item) =>
      item.container().matches(".stage-host"),
    );
    const layer = stage?.getLayers().at(-1);
    if (!layer) throw new Error("Missing token layer");
    return layer.getChildren().map((node) => ({ x: node.x(), y: node.y() }));
  });
}

async function chooseMap(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose map", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}

async function transparentBorderWebp(
  page: Page,
  width: number,
  height: number,
): Promise<string> {
  return page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Missing fixture canvas");
      context.fillStyle = "#3a7bd5";
      context.fillRect(width * 0.2, height * 0.2, width * 0.6, height * 0.6);
      return canvas.toDataURL("image/webp");
    },
    { width, height },
  );
}

test("a tall built-in WebP stage keeps its ratio and shows the board through its transparency", async ({
  page,
}) => {
  await page.goto("/board");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    DEFAULT.map.name,
  );
  const { width: pixelWidth, height: pixelHeight } = DEFAULT.stage.image;
  expect(pixelHeight).toBeGreaterThan(pixelWidth);
  const geometry = await expectBoardSize(
    page,
    scaledSize(pixelWidth, pixelHeight),
  );
  expect(geometry.bounds.width / geometry.bounds.height).toBeCloseTo(
    pixelWidth / pixelHeight,
    2,
  );
  await expectTransparentCornerShowsBoard(page);

  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  const start = await boardPoint(
    page,
    geometry.width * 0.01,
    geometry.height * 0.01,
  );
  const end = await boardPoint(
    page,
    geometry.width * 0.3,
    geometry.height * 0.06,
  );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  const inside = await boardPoint(
    page,
    geometry.width * 0.15,
    geometry.height * 0.035,
  );
  await page.mouse.click(inside.x, inside.y);
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "zone selected.",
  );

  await expectClampedDrop(page, "Hulk", 0.005, 0.995);
  await expectClampedDrop(page, "Angela", 0.005, 0.005);
});

test("a custom WebP upload with a transparent border keeps its ratio and alpha after reload", async ({
  page,
}) => {
  const pixelWidth = 2000;
  const pixelHeight = 1487;
  const name = "transparent-border.webp";
  await page.goto("/board");
  const dataUrl = await transparentBorderWebp(page, pixelWidth, pixelHeight);
  expect(dataUrl.startsWith("data:image/webp")).toBe(true);
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  await page.getByLabel("Upload map image", { exact: true }).setInputFiles({
    name,
    mimeType: "image/webp",
    buffer: Buffer.from(dataUrl.split(",")[1] ?? "", "base64"),
  });
  await expect(
    page.getByRole("dialog", { name: "Choose map", exact: true }),
  ).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  const size = scaledSize(pixelWidth, pixelHeight);
  const geometry = await expectBoardSize(page, size);
  expect(geometry.bounds.width / geometry.bounds.height).toBeCloseTo(
    pixelWidth / pixelHeight,
    2,
  );
  await expectTransparentCornerShowsBoard(page);
  await expectClampedDrop(page, "Hulk", 0.005, 0.005);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expectBoardSize(page, size);
  expect(await tokenPositions(page)).toContainEqual(
    clampToBoard({ x: 0, y: 0 }, size, ICON_SIZE),
  );
});

test("the stage switcher changes the board, keeps drawings per stage, undoes, and persists", async ({
  page,
}) => {
  await page.goto("/board");
  await expect(stageGroup(page).getByRole("button")).toHaveText([
    ...STAGE_NAMES,
  ]);
  await expect(stageButton(page, STAGE_NAMES[0])).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(stageButton(page, "Spaceport")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await stageButton(page, "Spaceport").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    DEFAULT.map.name,
  );
  await expect(stageButton(page, "Spaceport")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(stageButton(page, STAGE_NAMES[0])).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const spaceport = scaledSize(
    SPACEPORT.stage.image.width,
    SPACEPORT.stage.image.height,
  );
  await expectBoardSize(page, spaceport);

  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  await page
    .getByRole("button", { name: "Add at center", exact: true })
    .click();
  await selectNextDrawing(page);
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "zone selected.",
  );

  await stageButton(page, "Waterfall").click();
  await expect(stageButton(page, "Waterfall")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    `${DEFAULT.map.name} selected.`,
  );
  await selectNextDrawing(page);
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    `${DEFAULT.map.name} selected.`,
  );

  await stageButton(page, "Spaceport").click();
  await selectNextDrawing(page);
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "zone selected.",
  );

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(stageButton(page, "Waterfall")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(stageButton(page, "Spaceport")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectBoardSize(page, spaceport);

  await page.reload();
  await expect(stageButton(page, "Spaceport")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expectBoardSize(page, spaceport);
  await selectNextDrawing(page);
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "zone selected.",
  );

  await chooseMap(page, "Museum of Contemplation");
  await expect(stageGroup(page)).toHaveCount(0);
});

for (const width of [390, 320]) {
  test(`stage buttons stay inside a ${width} px wide page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/board");
    await expect(stageGroup(page).getByRole("button")).toHaveCount(
      STAGE_NAMES.length,
    );
    for (const name of STAGE_NAMES) {
      await expect(stageButton(page, name)).toBeInViewport({ ratio: 1 });
      const bounds = await stageButton(page, name).boundingBox();
      if (!bounds) throw new Error(`Missing ${name} button`);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("a stage switch keeps every hero and clamps them into the new stage", async ({
  page,
}) => {
  await page.goto("/board");
  const allies = page.getByRole("button", { name: /^Allies/ });
  const opponents = page.getByRole("button", { name: /^Opponents/ });
  await expect(allies).toHaveText("Allies 3");
  await stageButton(page, "Spaceport").click();
  const spaceport = await expectBoardSize(
    page,
    scaledSize(SPACEPORT.stage.image.width, SPACEPORT.stage.image.height),
  );
  await expect(allies).toHaveText("Allies 3");

  const strange = defaultToken("strange");
  const from = await boardPoint(page, strange.x, strange.y);
  const to = await boardPoint(
    page,
    spaceport.width * 0.99,
    spaceport.height * 0.99,
  );
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  const farCorner = clampToBoard(
    { x: spaceport.width, y: spaceport.height },
    spaceport,
    ICON_SIZE,
  );
  await expect(page.locator(".coordinates")).toHaveText(
    coordinatesText(farCorner),
  );

  await stageButton(page, STAGE_NAMES[0]).click();
  const institute = await expectBoardSize(
    page,
    scaledSize(DEFAULT.stage.image.width, DEFAULT.stage.image.height),
  );
  expect(institute.width).toBeLessThan(farCorner.x);
  await expect(allies).toHaveText("Allies 3");
  await expect(opponents).toHaveText("Opponents 3");
  const boundary = tokenBoundary(ICON_SIZE);
  const positions = await tokenPositions(page);
  expect(positions.length).toBeGreaterThan(0);
  for (const position of positions) {
    expect(position.x).toBeGreaterThanOrEqual(boundary);
    expect(position.x).toBeLessThanOrEqual(institute.width - boundary);
    expect(position.y).toBeGreaterThanOrEqual(boundary);
    expect(position.y).toBeLessThanOrEqual(institute.height - boundary);
  }
  const clamped = clampToBoard(farCorner, institute, ICON_SIZE);
  expect(positions).toContainEqual(clamped);
  await page.getByRole("button", { name: "Move", exact: true }).click();
  const target = await boardPoint(page, clamped.x, clamped.y);
  await page.mouse.click(target.x, target.y);
  await expect(page.locator(".selection-name strong")).toHaveText(
    "Doctor Strange",
  );
  await expect(page.locator(".coordinates")).toHaveText(
    coordinatesText(clamped),
  );
});
