import { expect, test } from '@playwright/test';
import type {} from './fixtures/board.ts';

for (const viewport of [{ width: 1280, height: 1000 }, { width: 1600, height: 720 }]) {
  test(`hero drop uses the map origin at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const canvas = page.locator('.stage-host canvas').first();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('Missing map bounds');
    const clientX = Math.floor(bounds.x + bounds.width / 2);
    const clientY = Math.floor(bounds.y + bounds.height / 2);
    const expectedX = Math.round((clientX - bounds.x) * 1200 / bounds.width);
    const expectedY = Math.round((clientY - bounds.y) * 654 / bounds.height);
    const dataTransfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.setData('application/x-rivals-hero', 'strange');
      data.setData('application/x-rivals-team', 'ally');
      return data;
    });
    await canvas.dispatchEvent('drop', {
      dataTransfer,
      clientX,
      clientY
    });
    await expect(page.locator('.coordinates')).toHaveText(`x ${expectedX}, y ${expectedY}`);
    await dataTransfer.dispose();
  });
}

test('selection and late portraits preserve a drag through board updates', async ({ page }) => {
  let releaseImages: () => void = () => undefined;
  const imagesReady = new Promise<void>((resolve) => { releaseImages = resolve; });
  await page.route('**/hero-icons/**', async (route) => {
    await imagesReady;
    await route.continue();
  });
  await page.goto('/tests/fixtures/board.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.boardHarness));
  await page.mouse.move(120, 120);
  await page.mouse.down();
  await page.mouse.move(145, 145, { steps: 4 });
  await expect.poll(() => page.evaluate(() => window.boardHarness.snapshot.selectedTokenId))
    .toBe('ally-strange');
  releaseImages();
  await page.waitForLoadState('networkidle');
  await page.mouse.move(170, 160, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.boardHarness.moves))
    .toEqual([{ x: 300, y: 280 }]);
  // The update after drag must leave the token at its new position.
  await page.mouse.click(400, 250);
  await page.mouse.click(170, 160);
  await expect.poll(() => page.evaluate(() => window.boardHarness.snapshot.selectedTokenId))
    .toBe('ally-strange');
});

test('drop coordinates follow resize and map changes', async ({ page }) => {
  await page.goto('/tests/fixtures/board.html');
  expect(await page.evaluate(() => window.boardHarness.board.toBoardPoint(120, 120)))
    .toEqual({ x: 200, y: 200 });
  await page.locator('#board').evaluate((host) => {
    host.style.width = '300px';
    host.style.height = '163.5px';
  });
  await expect.poll(() => page.evaluate(() => window.boardHarness.board.toBoardPoint(120, 120)))
    .toEqual({ x: 400, y: 400 });
  await page.evaluate(() => {
    const harness = window.boardHarness;
    harness.snapshot = {
      ...harness.snapshot,
      map: { ...harness.snapshot.map, width: 600, height: 327 }
    };
    harness.board.update(harness.snapshot);
  });
  expect(await page.evaluate(() => window.boardHarness.board.toBoardPoint(120, 120)))
    .toEqual({ x: 200, y: 200 });
});

test('destroy ignores pending images and repeated cleanup', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let releaseImages: () => void = () => undefined;
  const imagesReady = new Promise<void>((resolve) => { releaseImages = resolve; });
  await page.route(/\/(maps|hero-icons)\//, async (route) => {
    await imagesReady;
    await route.continue();
  });
  await page.goto('/tests/fixtures/board.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.boardHarness));
  await page.evaluate(() => {
    const { board, snapshot } = window.boardHarness;
    board.destroy();
    board.destroy();
    board.update(snapshot);
  });
  releaseImages();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#board canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('React keeps selection across drag and map change', async ({ page }) => {
  await page.goto('/');
  const host = page.locator('.stage-host canvas').first();
  const bounds = await host.boundingBox();
  if (!bounds) throw new Error('Missing board bounds');
  const scale = bounds.width / 1200;
  const x = bounds.x + 270 * scale;
  const y = bounds.y + 435 * scale;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60 * scale, y + 40 * scale, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.selection-name strong')).toHaveText('Doctor Strange');
  const coordinates = await page.locator('.coordinates').innerText();
  const match = /x (\d+), y (\d+)/.exec(coordinates);
  if (!match?.[1] || !match[2]) throw new Error('Missing token coordinates');
  // Browser mouse events round screen coordinates to whole pixels.
  const tolerance = Math.ceil(1 / scale);
  expect(Math.abs(Number(match[1]) - 330)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(Number(match[2]) - 475)).toBeLessThanOrEqual(tolerance);
  await page.getByRole('combobox').selectOption('hells-heaven-domination');
  await expect(page.locator('.selection-name strong')).toHaveText('Doctor Strange');
  await expect(page.locator('.coordinates')).toHaveText(coordinates);
  await expect(page.locator('.stage-host canvas')).toHaveCount(2);
});

test('late map images cannot replace the current map or selection', async ({ page }) => {
  let releaseMap: () => void = () => undefined;
  const oldMapReady = new Promise<void>((resolve) => { releaseMap = resolve; });
  await page.route('**/maps/**', async (route) => {
    const current = route.request().url().endsWith('/current.svg');
    if (!current) await oldMapReady;
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="654"><rect width="1200" height="654" fill="${current ? 'blue' : 'red'}"/></svg>`
    });
  });
  await page.goto('/tests/fixtures/board.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.boardHarness));
  await page.evaluate(() => {
    const harness = window.boardHarness;
    harness.snapshot = {
      ...harness.snapshot,
      selectedTokenId: 'ally-strange',
      map: { ...harness.snapshot.map, imagePath: '/maps/current.svg' }
    };
    harness.board.update(harness.snapshot);
  });
  const mapPixel = () => page.locator('#board canvas').first().evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing context');
    return [...context.getImageData(10, 10, 1, 1).data];
  });
  await expect.poll(mapPixel).toEqual([0, 0, 255, 255]);
  releaseMap();
  await page.waitForLoadState('networkidle');
  expect(await mapPixel()).toEqual([0, 0, 255, 255]);
  const ringPixel = await page.locator('#board canvas').last().evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing context');
    // At 0.5 scale the ring is centered on x=111; x=112 is outside it.
    return [...context.getImageData(110, 100, 1, 1).data];
  });
  expect(ringPixel).toEqual([255, 255, 255, 255]);
});
