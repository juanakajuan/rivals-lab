import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
]) {
  test(`the map uses most of the screen height at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/board");
    const canvas = page.locator(".stage-host canvas").first();
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(viewport.height * 0.8);
    await expect(
      page.getByRole("group", { name: "Board mode" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("slider", { name: "Hero icon size" }),
    ).toBeInViewport({ ratio: 1 });
  });
}

test("the zoom buttons and board controls form one panel right of the map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/board");
  const canvas = await page.locator(".stage-host canvas").first().boundingBox();
  const zoom = await page
    .getByRole("group", { name: "Map zoom" })
    .boundingBox();
  const mode = await page
    .getByRole("group", { name: "Board mode" })
    .boundingBox();
  const size = await page
    .getByRole("slider", { name: "Hero icon size" })
    .boundingBox();
  expect(canvas).not.toBeNull();
  expect(zoom).not.toBeNull();
  expect(mode).not.toBeNull();
  expect(size).not.toBeNull();
  const mapRight = (canvas?.x ?? 0) + (canvas?.width ?? 0);
  for (const bounds of [zoom, mode, size])
    expect(bounds?.x ?? 0).toBeGreaterThanOrEqual(mapRight);
  expect((zoom?.y ?? 0) + (zoom?.height ?? 0)).toBeLessThanOrEqual(
    mode?.y ?? 0,
  );
  expect((mode?.y ?? 0) + (mode?.height ?? 0)).toBeLessThanOrEqual(
    size?.y ?? 0,
  );
});
