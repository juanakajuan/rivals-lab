import { expect, test, type Page } from "@playwright/test";
import {
  boardGeometry,
  boardPoint,
  coordinatesText,
  DEFAULT_BOARD,
  type ClientPoint,
} from "./boardGeometry";
import { EXAMPLE_FORMATION, openExampleBoard } from "./boardSetup";

const map = DEFAULT_BOARD;
const [token] = [...EXAMPLE_FORMATION].sort(
  (a, b) =>
    Math.hypot(a.x - map.width / 2, a.y - map.height / 2) -
    Math.hypot(b.x - map.width / 2, b.y - map.height / 2),
);
if (!token) throw new Error("The example formation has no heroes");
const centerToken = token;

async function zoomPercent(page: Page): Promise<number> {
  const text = await page.locator(".zoom-level").textContent();
  return Number(text?.replace("%", ""));
}

async function zoomedTokenPoint(
  page: Page,
  zoom: number,
  pan: ClientPoint,
): Promise<ClientPoint> {
  const { bounds, width, height, scale } = await boardGeometry(page);
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  return {
    x: center.x + (centerToken.x - width / 2) * scale * zoom + pan.x,
    y: center.y + (centerToken.y - height / 2) * scale * zoom + pan.y,
  };
}

test("the scroll wheel zooms around the pointer and heroes stay clickable", async ({
  page,
}) => {
  await openExampleBoard(page);
  const point = await boardPoint(page, token.x, token.y);
  await expect(page.locator(".zoom-level")).toHaveText("100%");
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, 100);
  await expect(page.locator(".zoom-level")).toHaveText("100%");
  await page.mouse.wheel(0, -400);
  await expect.poll(() => zoomPercent(page)).toBeGreaterThan(150);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(".coordinates")).toHaveText(coordinatesText(token));

  const { scale } = await boardGeometry(page);
  const zoom = (await zoomPercent(page)) / 100;
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 60, point.y, { steps: 6 });
  await page.mouse.up();
  const moved = token.x + 60 / (scale * zoom);
  const text = await page.locator(".coordinates").textContent();
  const x = Number(/x (\d+)/.exec(text ?? "")?.[1]);
  expect(Math.abs(x - moved)).toBeLessThan(3);
});

test("the zoom buttons zoom the map, dragging the map pans it, and Fit map restores it", async ({
  page,
}) => {
  await openExampleBoard(page);
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  const fit = page.getByRole("button", { name: "Fit map" });
  await expect(zoomOut).toBeDisabled();
  await expect(fit).toBeDisabled();

  await zoomIn.click();
  await expect(page.locator(".zoom-level")).toHaveText("150%");
  await expect(zoomOut).toBeEnabled();
  const zoomed = await zoomedTokenPoint(page, 1.5, { x: 0, y: 0 });
  await page.mouse.click(zoomed.x, zoomed.y);
  await expect(page.locator(".coordinates")).toHaveText(coordinatesText(token));

  const { bounds } = await boardGeometry(page);
  const corner = { x: bounds.x + 4, y: bounds.y + 4 };
  await page.mouse.click(corner.x, corner.y);
  await expect(page.locator(".selection-summary")).toHaveCount(0);
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x, corner.y + 40, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator(".selection-summary")).toHaveCount(0);
  const panned = await zoomedTokenPoint(page, 1.5, { x: 0, y: 40 });
  await page.mouse.click(panned.x, panned.y);
  await expect(page.locator(".coordinates")).toHaveText(coordinatesText(token));

  await page.locator(".stage-host").focus();
  await page.keyboard.press("+");
  await expect(page.locator(".zoom-level")).toHaveText("225%");
  await page.keyboard.press("-");
  await expect(page.locator(".zoom-level")).toHaveText("150%");

  await fit.click();
  await expect(page.locator(".zoom-level")).toHaveText("100%");
  await expect(fit).toBeDisabled();
  await page.mouse.click(corner.x, corner.y);
  const point = await boardPoint(page, token.x, token.y);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(".coordinates")).toHaveText(coordinatesText(token));
});
