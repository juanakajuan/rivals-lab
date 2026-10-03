import { expect, test, type Page, type Locator } from "@playwright/test";
import type Konva from "konva";

declare global {
  interface Window {
    readonly Konva?: typeof Konva;
    releaseBoardImageDecode?: () => void;
  }
}

interface ImageFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

async function imageFile(
  page: Page,
  width: number,
  height: number,
  name = "custom-map.png",
  mimeType = "image/png",
): Promise<ImageFile> {
  const encoded = await page.evaluate(
    ({ width, height, mimeType }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Missing fixture canvas");
      for (const [color, x, y] of [
        ["#ff0000", 0, 0],
        ["#00ff00", width / 2, 0],
        ["#0000ff", 0, height / 2],
        ["#ffff00", width / 2, height / 2],
      ] satisfies readonly (readonly [string, number, number])[]) {
        context.fillStyle = color;
        context.fillRect(x, y, width / 2, height / 2);
      }
      return canvas.toDataURL(mimeType).split(",")[1];
    },
    { width, height, mimeType },
  );
  if (!encoded) throw new Error("Cannot create image fixture");
  return { name, mimeType, buffer: Buffer.from(encoded, "base64") };
}

function picker(page: Page): Locator {
  return page.getByRole("dialog", { name: "Choose map", exact: true });
}

async function openPicker(page: Page): Promise<void> {
  if (!(await picker(page).isVisible())) {
    await page.getByRole("button", { name: "Choose map", exact: true }).click();
  }
  await expect(picker(page)).toBeVisible();
}

async function upload(page: Page, file: ImageFile): Promise<void> {
  await openPicker(page);
  await page
    .getByLabel("Upload map image", { exact: true })
    .setInputFiles(file);
  await expect(picker(page)).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Choose map", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(file.name);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stage = window.Konva?.stages.find((item) =>
          item.container().matches(".stage-host"),
        );
        const image = stage?.getLayers()[0]?.findOne("Image");
        return image !== undefined;
      }),
    )
    .toBe(true);
}

async function point(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return page.evaluate(
    ({ x, y }) => {
      const stage = window.Konva?.stages.find((item) =>
        item.container().matches(".stage-host"),
      );
      if (!stage) throw new Error("Missing board stage");
      const bounds = stage.content.getBoundingClientRect();
      return {
        x: bounds.x + x * stage.scaleX(),
        y: bounds.y + y * stage.scaleY(),
      };
    },
    { x, y },
  );
}

async function drag(
  page: Page,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Promise<void> {
  const start = await point(page, startX, startY);
  const end = await point(page, endX, endY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

async function chooseMap(page: Page, name: string): Promise<void> {
  await openPicker(page);
  await page
    .getByRole("dialog", { name: "Choose map", exact: true })
    .getByRole("button", { name, exact: true })
    .click();
  await expect(picker(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}

async function renderedBoard(page: Page): Promise<unknown> {
  await point(page, 0, 0);
  return page.evaluate(async () => {
    const konva = window.Konva;
    const stage = konva?.stages.find((item) =>
      item.container().matches(".stage-host"),
    );
    if (!konva || !stage) throw new Error("Missing board");
    interface RenderedNode {
      readonly kind: string;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly text: string | null;
      readonly image: string | null;
      readonly points: readonly number[];
      readonly children: readonly RenderedNode[];
    }
    const capture = async (node: Konva.Node): Promise<RenderedNode> => {
      const image = node instanceof konva.Image ? node.image() : undefined;
      const source = image instanceof HTMLImageElement ? image.src : null;
      const digest =
        source === null
          ? null
          : Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  new TextEncoder().encode(source),
                ),
              ),
            )
              .map((byte) => byte.toString(16).padStart(2, "0"))
              .join("");
      return {
        kind: node.getClassName(),
        x: node.x(),
        y: node.y(),
        width: node.width(),
        height: node.height(),
        text: node instanceof konva.Text ? node.text() : null,
        image: digest,
        points: node instanceof konva.Line ? node.points() : [],
        children:
          node instanceof konva.Container
            ? await Promise.all(node.getChildren().map(capture))
            : [],
      };
    };
    return Promise.all(
      stage
        .getLayers()
        .map((layer) => Promise.all(layer.getChildren().map(capture))),
    );
  });
}

for (const { name, width, height, logicalWidth, logicalHeight } of [
  {
    name: "portrait",
    width: 400,
    height: 800,
    logicalWidth: 600,
    logicalHeight: 1200,
  },
  {
    name: "square",
    width: 640,
    height: 640,
    logicalWidth: 1200,
    logicalHeight: 1200,
  },
  { name: "tiny", width: 4, height: 2, logicalWidth: 1200, logicalHeight: 600 },
  {
    name: "large",
    width: 4000,
    height: 2000,
    logicalWidth: 1200,
    logicalHeight: 600,
  },
  {
    name: "wide",
    width: 2000,
    height: 100,
    logicalWidth: 6000,
    logicalHeight: 300,
  },
]) {
  test(`${name} image keeps its exact ratio and all four corners`, async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, await imageFile(page, width, height, `${name}.png`));
    const geometry = await page.evaluate(() => {
      const stage = window.Konva?.stages.find((item) =>
        item.container().matches(".stage-host"),
      );
      const canvas = document.querySelector(".stage-host canvas");
      if (!stage || !(canvas instanceof HTMLCanvasElement))
        throw new Error("Missing map canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Missing map context");
      const bounds = canvas.getBoundingClientRect();
      const host = stage.container().getBoundingClientRect();
      return {
        width: stage.width() / stage.scaleX(),
        height: stage.height() / stage.scaleY(),
        ratio: bounds.width / bounds.height,
        inside:
          bounds.x >= host.x - 1 &&
          bounds.y >= host.y - 1 &&
          bounds.right <= host.right + 1 &&
          bounds.bottom <= host.bottom + 1,
        colors: [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.1, 0.9],
          [0.9, 0.9],
        ].map(([x = 0, y = 0]) =>
          Array.from(
            context.getImageData(
              Math.floor(canvas.width * x),
              Math.floor(canvas.height * y),
              1,
              1,
            ).data,
          ),
        ),
      };
    });
    expect(geometry.width).toBeCloseTo(logicalWidth);
    expect(geometry.height).toBeCloseTo(logicalHeight);
    expect(geometry.ratio).toBeCloseTo(width / height, 1);
    expect(geometry.inside).toBe(true);
    expect(geometry.colors).toEqual([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
    ]);
  });
}

for (const mimeType of ["image/jpeg", "image/webp"]) {
  test(`${mimeType} image can be selected`, async ({ page }) => {
    await page.goto("/");
    await upload(page, await imageFile(page, 600, 400, "map-image", mimeType));
    await page.getByRole("button", { name: "Choose map", exact: true }).click();
    const card = page
      .getByRole("dialog", { name: "Choose map", exact: true })
      .getByRole("button", { name: "map-image", exact: true });
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByText("Custom image", { exact: true })).toBeVisible();
    await expect(card.locator("img")).toHaveAttribute(
      "src",
      new RegExp(`^data:${mimeType};base64,`),
    );
  });
}

test("GIF images and repeated selection create separate maps and drawings", async ({
  page,
}) => {
  await page.goto("/");
  const file = {
    name: "tiny.gif",
    mimeType: "image/gif",
    buffer: Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64",
    ),
  };
  await upload(page, file);
  await page.getByRole("button", { name: "Draw arrow", exact: true }).click();
  await page
    .getByRole("button", { name: "Add at center", exact: true })
    .click();
  await upload(page, file);
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "tiny.gif selected.",
  );
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  const cards = page
    .getByRole("dialog", { name: "Choose map", exact: true })
    .getByRole("button", { name: "tiny.gif", exact: true });
  await expect(cards).toHaveCount(2);
  await cards.nth(0).click();
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "arrow selected.",
  );
});

test("portrait heroes and each drawing tool work through image replacement and history", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, await imageFile(page, 400, 800, "portrait.png"));
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page
    .getByRole("button", { name: "Add Hulk to Allies", exact: true })
    .click();
  await expect(page.locator(".coordinates")).toHaveText("x 52, y 52");
  await drag(page, 52, 52, 150, 150);
  const coordinates = await page.locator(".coordinates").innerText();
  const [x, y] = coordinates.match(/\d+/g)?.map(Number) ?? [];
  expect(x).toBeGreaterThanOrEqual(148);
  expect(x).toBeLessThanOrEqual(152);
  expect(y).toBeGreaterThanOrEqual(148);
  expect(y).toBeLessThanOrEqual(152);
  await page.getByRole("button", { name: "Draw arrow", exact: true }).click();
  await drag(page, 180, 300, 420, 380);
  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  await drag(page, 180, 500, 420, 600);
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  const notePoint = await point(page, 180, 700);
  await page.mouse.click(notePoint.x, notePoint.y);
  await page
    .getByRole("textbox", { name: "Note text", exact: true })
    .fill("Hold the point");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
  const formation = await renderedBoard(page);
  await upload(page, await imageFile(page, 800, 400, "replacement.png"));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "portrait.png",
  );
  expect(await renderedBoard(page)).toEqual(formation);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "replacement.png",
  );
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "Board edit restored.",
  );
  await chooseMap(page, "portrait.png");
  expect(await renderedBoard(page)).toEqual(formation);
  for (const kind of ["arrow", "zone", "note"]) {
    await page.locator(".stage-host").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[aria-live="polite"]')).toHaveText(
      `${kind} selected.`,
    );
  }
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveValue("Hold the point");
  await chooseMap(page, "Hydra Charteris Base: Hell's Heaven");
  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  await page
    .getByRole("button", { name: "Add at center", exact: true })
    .click();
  await chooseMap(page, "portrait.png");
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "arrow selected.",
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  const renderedTokens = await page.evaluate(() => {
    const stage = window.Konva?.stages.find((item) =>
      item.container().matches(".stage-host"),
    );
    if (!stage) throw new Error("Missing board");
    return stage
      .getLayers()
      .at(-1)
      ?.getChildren()
      .map((node) => ({ x: node.x(), y: node.y() }));
  });
  expect(renderedTokens).toEqual([
    { x: 270, y: 435 },
    { x: 380, y: 350 },
    { x: 230, y: 520 },
    { x: 576, y: 310 },
    { x: 576, y: 410 },
    { x: 576, y: 515 },
  ]);
});

test("failed uploads preserve image, drawings, formation, undo, and redo", async ({
  page,
}) => {
  await page.goto("/");
  await upload(page, await imageFile(page, 800, 400));
  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  await page
    .getByRole("button", { name: "Add at center", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const before = await renderedBoard(page);
  const excessivePixels = await imageFile(
    page,
    5000,
    5000,
    "too-many-pixels.png",
  );
  await openPicker(page);
  for (const { file, message } of [
    {
      file: {
        name: "text.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("not a map"),
      },
      message: "Choose a PNG, JPEG, WebP, or GIF image.",
    },
    {
      file: {
        name: "unreadable.png",
        mimeType: "image/png",
        buffer: Buffer.from("broken image"),
      },
      message: "Cannot read this image. Choose another file.",
    },
    {
      file: {
        name: "renamed-svg.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="red"/></svg>',
        ),
      },
      message: "Cannot read this image. Choose another file.",
    },
    {
      file: {
        name: "oversized.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
      },
      message: "Choose an image of 10 MiB or less.",
    },
    {
      file: excessivePixels,
      message:
        "Choose an image with valid dimensions and at most 24 million pixels.",
    },
  ]) {
    await page
      .getByLabel("Upload map image", { exact: true })
      .setInputFiles(file);
    await expect(picker(page)).toBeVisible();
    await expect(picker(page).getByRole("alert")).toHaveText(message);
    await expect(page.locator(".map-title h1")).toHaveText("custom-map.png");
    expect(await renderedBoard(page)).toEqual(before);
    await expect(
      page.getByRole("button", {
        name: "Undo",
        exact: true,
        includeHidden: true,
      }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", {
        name: "Redo",
        exact: true,
        includeHidden: true,
      }),
    ).toBeEnabled();
  }
  await picker(page)
    .getByRole("button", { name: "Close map picker", exact: true })
    .click();
  await expect(picker(page)).toBeHidden();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[aria-live="polite"]')).toHaveText(
    "zone selected.",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".map-title h1")).toHaveText(
    "Intergalactic Empire of Wakanda: Birnin T'Challa",
  );
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
});

for (const laterChoice of ["builtin", "upload", "undo", "close"] as const) {
  test(`late upload completion cannot replace a later ${laterChoice} selection`, async ({
    page,
  }) => {
    await page.goto("/");
    await upload(page, await imageFile(page, 800, 400, "first.png"));
    const late = await imageFile(page, 400, 800, "late.png");
    const newer = await imageFile(page, 800, 800, "newer.png");
    await page.evaluate(() => {
      const decode: unknown = Reflect.get(HTMLImageElement.prototype, "decode");
      if (typeof decode !== "function")
        throw new Error("Missing image decoder");
      let hold = true;
      HTMLImageElement.prototype.decode = async function () {
        const decoded: unknown = Reflect.apply(decode, this, []);
        const delayed = hold && this.src.startsWith("data:");
        if (delayed) hold = false;
        await decoded;
        if (delayed) {
          await new Promise<void>((resolve) => {
            window.releaseBoardImageDecode = resolve;
          });
        }
      };
    });
    await openPicker(page);
    await page
      .getByLabel("Upload map image", { exact: true })
      .setInputFiles(late);
    await expect(page.getByRole("status")).toHaveText("Loading late.png...");
    await expect
      .poll(() => page.evaluate(() => typeof window.releaseBoardImageDecode))
      .toBe("function");
    if (laterChoice === "builtin")
      await chooseMap(page, "Museum of Contemplation");
    else if (laterChoice === "upload") await upload(page, newer);
    else if (laterChoice === "undo") {
      await page.keyboard.press("Escape");
      await expect(picker(page)).toBeHidden();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
    } else {
      await picker(page)
        .getByRole("button", { name: "Close map picker", exact: true })
        .click();
      await expect(picker(page)).toBeHidden();
    }
    await page.evaluate(async () => {
      window.releaseBoardImageDecode?.();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      laterChoice === "builtin"
        ? "Museum of Contemplation"
        : laterChoice === "upload"
          ? "newer.png"
          : laterChoice === "close"
            ? "first.png"
            : "Intergalactic Empire of Wakanda: Birnin T'Challa",
    );
    await page.getByRole("button", { name: "Choose map", exact: true }).click();
    await expect(
      page
        .getByRole("dialog", { name: "Choose map", exact: true })
        .getByRole("button", { name: "late.png", exact: true }),
    ).toHaveCount(0);
  });
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 320, height: 900 },
]) {
  test(`portrait upload controls and image fit at width ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const filename =
      "a-very-long-custom-map-image-filename-for-the-position-board.png";
    const file = await imageFile(page, 400, 800, filename);
    await expect(
      page.getByRole("button", { name: "Upload image", exact: true }),
    ).toHaveCount(0);
    await openPicker(page);
    const search = picker(page).getByRole("searchbox", {
      name: "Search maps",
      exact: true,
    });
    await search.fill("no maps match this search");
    await expect(picker(page).getByRole("status")).toHaveText(
      "No maps match your search.",
    );
    const button = picker(page).getByRole("button", {
      name: "Upload image",
      exact: true,
    });
    await expect(button).toBeVisible();
    const actionBounds = await button.boundingBox();
    if (!actionBounds) throw new Error("Missing upload control");
    expect(actionBounds.x).toBeGreaterThanOrEqual(0);
    expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(
      viewport.width,
    );
    await button.focus();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await (await chooserPromise).setFiles(file);
    await expect(picker(page)).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Choose map", exact: true }),
    ).toBeFocused();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(filename);
    const bounds = await page.getByRole("heading", { level: 1 }).boundingBox();
    if (!bounds) throw new Error("Missing board heading");
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
    await page.getByRole("button", { name: "Choose map", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("dialog", { name: "Choose map", exact: true })
        .getByRole("button", { name: filename, exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Choose map", exact: true }),
    ).toBeFocused();
  });
}

for (const budget of ["bytes", "pixels"] as const) {
  test(`total ${budget} upload budget preserves the last accepted board`, async ({
    page,
  }) => {
    await page.goto("/");
    const source = await imageFile(
      page,
      budget === "pixels" ? 5000 : 800,
      budget === "pixels" ? 4000 : 400,
    );
    const file =
      budget === "bytes"
        ? {
            ...source,
            buffer: Buffer.concat([
              source.buffer,
              Buffer.alloc(8 * 1024 * 1024 - source.buffer.length),
            ]),
          }
        : source;
    const acceptedCount = budget === "bytes" ? 6 : 4;
    for (let index = 1; index <= acceptedCount; index++)
      await upload(page, { ...file, name: `map-${index}.png` });
    const before = await renderedBoard(page);
    await openPicker(page);
    await page
      .getByLabel("Upload map image", { exact: true })
      .setInputFiles({ ...file, name: "over-total.png" });
    await expect(page.getByRole("alert")).toHaveText(
      budget === "bytes"
        ? "This tab has a 50 MiB total image limit. Reload to start again."
        : "This tab has an 80 million pixel total image limit. Reload to start again.",
    );
    await expect(page.locator(".map-title h1")).toHaveText(
      `map-${acceptedCount}.png`,
    );
    expect(await renderedBoard(page)).toEqual(before);
    await picker(page)
      .getByRole("button", { name: "Close map picker", exact: true })
      .click();
    await expect(picker(page)).toBeHidden();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".map-title h1")).toHaveText(
      `map-${acceptedCount - 1}.png`,
    );
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(page.locator(".map-title h1")).toHaveText(
      `map-${acceptedCount}.png`,
    );
  });
}

test("cancelled native file choice keeps the modal and board, then an invalid upload can retry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Draw zone", exact: true }).click();
  await page
    .getByRole("button", { name: "Add at center", exact: true })
    .click();
  const before = await renderedBoard(page);
  await expect(
    page
      .locator(".board-heading")
      .getByRole("button", { name: "Upload image", exact: true }),
  ).toHaveCount(0);
  await openPicker(page);
  const uploadButton = picker(page).getByRole("button", {
    name: "Upload image",
    exact: true,
  });
  await uploadButton.focus();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooserPromise).setFiles([]);
  await expect(picker(page)).toBeVisible();
  await expect(picker(page).getByRole("alert")).toHaveCount(0);
  expect(await renderedBoard(page)).toEqual(before);
  await picker(page)
    .getByLabel("Upload map image", { exact: true })
    .setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("broken image"),
    });
  await expect(picker(page).getByRole("alert")).toHaveText(
    "Cannot read this image. Choose another file.",
  );
  await expect(picker(page)).toBeVisible();
  expect(await renderedBoard(page)).toEqual(before);
  await upload(page, await imageFile(page, 800, 400, "retry.png"));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("retry.png");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Intergalactic Empire of Wakanda: Birnin T'Challa",
  );
  expect(await renderedBoard(page)).toEqual(before);
});
