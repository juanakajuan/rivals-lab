import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function chooseCompMap(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Comp map", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose comp map", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
}

test("serves built JavaScript and CSS without the development client", async ({
  page,
  request,
}) => {
  const response = await page.goto("/builder");
  expect(response?.status()).toBe(200);
  const script = page.locator('script[type="module"][src]');
  const stylesheet = page.locator('link[rel="stylesheet"]');
  await expect(script).toHaveAttribute("src", /^\/assets\/index-[\w-]+\.js$/);
  await expect(stylesheet).toHaveAttribute(
    "href",
    /^\/assets\/index-[\w-]+\.css$/,
  );
  await expect(page.locator('script[src="/@vite/client"]')).toHaveCount(0);
  for (const path of [
    await script.getAttribute("src"),
    await stylesheet.getAttribute("href"),
  ]) {
    if (!path) throw new Error("Missing production asset path");
    const asset = await request.get(path);
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toMatch(/javascript|text\/css/);
  }
});

test("saved comp fields survive a production reload", async ({ page }) => {
  await page.goto("/builder");
  await page.getByLabel("Comp name", { exact: true }).fill("Midtown plan");
  await chooseCompMap(page, "Midtown");
  await page
    .getByRole("button", { name: "Allies slot 1: Choose hero", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Doctor Strange", exact: true })
    .click();
  await page.getByLabel("Allies slot 1 notes").fill("Hold the corner.");
  await page.getByLabel("Draft format").selectOption("mrc");
  await page
    .getByRole("button", { name: "Opponents ban 4: Choose hero", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Hulk", exact: true })
    .click();
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Take high ground.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Midtown plan.");
  await page.reload();
  await page
    .getByRole("button", { name: "Load Midtown plan", exact: true })
    .click();
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "Midtown plan",
  );
  await expect(page.locator(".selected-map-preview figcaption")).toHaveText(
    "Midtown · Convoy",
  );
  await expect(
    page.getByRole("button", {
      name: "Allies slot 1: Doctor Strange",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Allies slot 1 notes")).toHaveValue(
    "Hold the corner.",
  );
  await expect(page.getByLabel("Draft format")).toHaveValue("mrc");
  await expect(
    page.getByRole("button", { name: "Opponents ban 4: Hulk", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Take high ground.",
  );
});

test("board token drag can be undone and redone", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/board");
  const canvas = page.locator(".stage-host canvas").first();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  const scale = bounds.width / 1200;
  const x = bounds.x + 270 * scale;
  const y = bounds.y + 435 * scale;
  await page.mouse.click(x, y);
  await expect(page.locator(".selection-name strong")).toHaveText(
    "Doctor Strange",
  );
  await expect(page.locator(".coordinates")).toHaveText("x 270, y 435");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80 * scale, y + 45 * scale, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".coordinates")).not.toHaveText("x 270, y 435");
  const moved = await page.locator(".coordinates").innerText();
  const coordinates = /^x (\d+), y (\d+)$/.exec(moved);
  if (!coordinates?.[1] || !coordinates[2])
    throw new Error("Missing token coordinates");
  const tolerance = Math.ceil(1 / scale);
  expect(Math.abs(Number(coordinates[1]) - 350)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(Number(coordinates[2]) - 480)).toBeLessThanOrEqual(tolerance);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".coordinates")).toHaveText("x 270, y 435");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".coordinates")).toHaveText(moved);
});

test("downloads a PNG independently of browser clipboard support", async ({
  page,
  context,
  browserName,
}, testInfo) => {
  // Firefox and WebKit do not use Chromium's clipboard permission names.
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/builder");
  await page.getByLabel("Comp name", { exact: true }).fill("Production plan");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Hold high ground.");
  const exportButton = page.getByRole("button", {
    name: "Download & Copy",
    exact: true,
  });
  const ready = page.waitForEvent("download");
  await exportButton.click();
  const download = await ready;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe("Production-plan.png");
  const path = testInfo.outputPath("production-plan.png");
  await download.saveAs(path);
  const bytes = await readFile(path);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const dimensions = await page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const result = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return result;
    },
    [...bytes],
  );
  expect(dimensions.width).toBeGreaterThan(1000);
  expect(dimensions.height).toBeGreaterThan(100);
  await testInfo.attach("production-plan.png", {
    path,
    contentType: "image/png",
  });

  // Verify the download before checking clipboard success or an expected limit.
  await expect(exportButton).toBeEnabled();
  if (browserName === "chromium") {
    await expect(page.getByRole("status")).toHaveText(
      "Download started. Image copied to clipboard.",
    );
    expect(
      await page.evaluate(async () =>
        (await navigator.clipboard.read()).some((item) =>
          item.types.includes("image/png"),
        ),
      ),
    ).toBe(true);
    await expect(page.getByRole("alert")).toHaveCount(0);
    return;
  }
  await expect(page.getByRole("status")).toHaveText(
    /^Download started\.( Image copied to clipboard\.)?$/,
  );
  if ((await page.getByRole("status").innerText()) === "Download started.") {
    await expect(page.getByRole("alert")).toHaveText(
      /^Image was not copied\. (Image clipboard access is not supported here\.|Clipboard access was denied\. Allow clipboard access and try again\.)$/,
    );
  } else {
    await expect(page.getByRole("alert")).toHaveCount(0);
  }
});
