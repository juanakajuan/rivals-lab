import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { emptyComp, type Comp } from "../src/comps";
import { emptyDraft, setDraftHero } from "../src/draft";
import { exportCompLibrary, readStoredCompLibrary } from "./compLibrary";

const reviewName = "Review imported comp";
test.setTimeout(120_000);

async function chooseHero(
  page: Page,
  slot: string,
  name: string,
): Promise<void> {
  await page.getByRole("button", { name: slot, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
}

async function downloadImage(page: Page): Promise<Buffer> {
  const ready = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download & Copy", exact: true })
    .click();
  const path = await (await ready).path();
  if (!path) throw new Error("The exported image has no download file.");
  await expect(
    page.getByRole("button", { name: "Download & Copy", exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("status")).toHaveText(
    /^(Download started\.|Download started\. Image copied to clipboard\.)$/,
  );
  return readFile(path);
}

type ImageMimeType = "image/png" | "image/jpeg" | "image/webp";

async function reviewImage(
  page: Page,
  buffer: Buffer,
  mimeType: ImageMimeType = "image/png",
): Promise<void> {
  await page.getByLabel("Import comp image", { exact: true }).setInputFiles({
    name: `comp.${mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png"}`,
    mimeType,
    buffer,
  });
  await expect(
    page.getByRole("dialog", { name: reviewName, exact: true }),
  ).toBeVisible({ timeout: 20_000 });
}

async function openImage(page: Page): Promise<void> {
  await page
    .getByRole("dialog", { name: reviewName, exact: true })
    .getByRole("button", { name: "Open in editor", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function saveComp(page: Page, name: string): Promise<void> {
  await page.getByLabel("Comp name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(`Saved ${name}.`);
}

async function expectLibraryComps(
  page: Page,
  comps: readonly Comp[],
): Promise<void> {
  const library: unknown = JSON.parse(await exportCompLibrary(page));
  expect(library).toEqual({
    version: 1,
    comps: comps.map((comp) => ({
      id: expect.any(String),
      updatedAt: expect.any(String),
      comp,
    })),
  });
}

async function reencodePixels(
  page: Page,
  source: Buffer,
  useClipboard: boolean,
  mimeType: ImageMimeType = "image/png",
): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ({ source, useClipboard, mimeType }) => {
      let blob = new Blob([new Uint8Array(source)], { type: "image/png" });
      if (useClipboard) {
        const items = await navigator.clipboard.read();
        const item = items.find((item) => item.types.includes("image/png"));
        if (!item) throw new Error("The clipboard has no exported PNG.");
        blob = await item.getType("image/png");
      }
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Cannot re-encode the exported pixels.");
        context.drawImage(image, 0, 0);
        const encoded = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (result) => {
              if (result) resolve(result);
              else reject(new Error("Cannot encode the exported pixels."));
            },
            mimeType,
            0.85,
          );
        });
        if (encoded.type !== mimeType)
          throw new Error(`Cannot encode ${mimeType} in this browser.`);
        return [...new Uint8Array(await encoded.arrayBuffer())];
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { source: [...source], useClipboard, mimeType },
  );
  return Buffer.from(bytes);
}

test("image review preserves edits and imported Save creates a new exact comp", async ({
  page,
  context,
  browserName,
}, testInfo) => {
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/builder");
  await page.getByLabel("Comp name", { exact: true }).fill("Original plan");
  await page.getByRole("button", { name: "Comp map", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose comp map", exact: true })
    .getByRole("button", { name: "Midtown", exact: true })
    .click();
  await chooseHero(page, "Allies slot 1: Choose hero", "Deadpool · Strategist");
  await chooseHero(
    page,
    "Opponents slot 1: Choose hero",
    "Deadpool · Vanguard",
  );
  await chooseHero(page, "Allies slot 6: Choose hero", "Doctor Strange");
  await chooseHero(page, "Opponents slot 4: Choose hero", "Doctor Strange");
  await page
    .getByLabel("Allies slot 1 notes")
    .fill("  Hold portal.\n第二波 🦊  ");
  await page.getByLabel("Allies slot 3 notes").fill("Empty slot plan");
  await page
    .getByLabel("Opponents slot 6 notes")
    .fill("\tWatch high ground.  ");
  await page.getByLabel("Draft format").selectOption("mrc");
  await chooseHero(page, "Allies ban 4: Choose hero", "Hulk");
  await chooseHero(page, "Opponents save 2: Choose hero", "Luna Snow");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("  Rotate late.\n保存 🦊  ");
  await saveComp(page, "Original plan");
  await page
    .getByRole("button", { name: "Load Original plan", exact: true })
    .click();
  const baseline = await exportCompLibrary(page);
  const storedBaseline = await readStoredCompLibrary(page);
  await page.getByLabel("Comp name", { exact: true }).fill("  Original plan  ");
  const image = await downloadImage(page);
  const pixels = await reencodePixels(page, image, browserName === "chromium");
  await page.getByLabel("Comp name", { exact: true }).fill("Current edits");
  await page.getByLabel("Comp notes", { exact: true }).fill("Keep this work");
  await reviewImage(page, image);
  const review = page.getByRole("dialog", { name: reviewName, exact: true });
  await expect(review).toContainText("Original plan");
  await expect(review).toContainText("Midtown");
  await expect(review).toContainText("Strategist");
  await expect(review).toContainText("Vanguard");
  expect(await readStoredCompLibrary(page)).toBe(storedBaseline);
  await testInfo.attach("image review", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "Current edits",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep this work",
  );
  expect(await exportCompLibrary(page)).toBe(baseline);
  await reviewImage(page, image);
  page.once("dialog", (dialog) => dialog.dismiss());
  await review
    .getByRole("button", { name: "Open in editor", exact: true })
    .click();
  await expect(review).toBeVisible();
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep this work",
  );
  expect(await readStoredCompLibrary(page)).toBe(storedBaseline);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await reviewImage(page, pixels);
  page.once("dialog", (dialog) => dialog.accept());
  await openImage(page);
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "  Original plan  ",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "  Rotate late.\n保存 🦊  ",
  );
  expect(await exportCompLibrary(page)).toBe(baseline);
  await saveComp(page, "Imported edit");
  const empty = emptyComp();
  const original: Comp = {
    ...empty,
    name: "Original plan",
    notes: "  Rotate late.\n保存 🦊  ",
    mapId: "midtown",
    teams: {
      ally: [
        {
          heroId: "deadpool",
          deadpoolRole: "Strategist",
          notes: "  Hold portal.\n第二波 🦊  ",
        },
        { heroId: null, notes: "" },
        { heroId: null, notes: "Empty slot plan" },
        { heroId: null, notes: "" },
        { heroId: null, notes: "" },
        { heroId: "strange", notes: "" },
      ],
      enemy: [
        { heroId: "deadpool", deadpoolRole: "Vanguard", notes: "" },
        { heroId: null, notes: "" },
        { heroId: null, notes: "" },
        { heroId: "strange", notes: "" },
        { heroId: null, notes: "" },
        { heroId: null, notes: "\tWatch high ground.  " },
      ],
    },
    draft: setDraftHero(
      setDraftHero(
        emptyDraft("mrc"),
        { team: "ally", kind: "ban", index: 3 },
        "hulk",
      ),
      { team: "enemy", kind: "save", index: 1 },
      "luna",
    ),
  };
  const library: unknown = JSON.parse(await exportCompLibrary(page));
  const oldLibrary: unknown = JSON.parse(baseline);
  if (
    typeof oldLibrary !== "object" ||
    oldLibrary === null ||
    !("comps" in oldLibrary) ||
    !Array.isArray(oldLibrary.comps)
  )
    throw new Error("The original JSON library has no entries.");
  const originalEntries: readonly unknown[] = oldLibrary.comps;
  expect(library).toEqual({
    version: 1,
    comps: [
      {
        id: expect.any(String),
        updatedAt: expect.any(String),
        comp: { ...original, name: "Imported edit" },
      },
      ...originalEntries,
    ],
  });
  await expect(page.locator(".saved-comp")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Load Original plan", exact: true }),
  ).toBeVisible();
  await expectLibraryComps(page, [
    { ...original, name: "Imported edit" },
    original,
  ]);
});

test("an unnamed incomplete image preserves sparse Ignite slots and Unicode", async ({
  page,
}) => {
  await page.goto("/builder");
  await chooseHero(page, "Allies slot 2: Choose hero", "Deadpool · Duelist");
  await page.getByLabel("Allies slot 5 notes").fill("  東京 🦊 é\t ");
  await page.getByLabel("Draft format").selectOption("ignite");
  await chooseHero(page, "Opponents ban 5: Choose hero", "Hulk");
  await chooseHero(page, "Allies save 2: Choose hero", "Luna Snow");
  const image = await downloadImage(page);
  const corrected = await mutateStrip(page, image, "correctable");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New comp", exact: true }).click();
  await reviewImage(page, image);
  await expect(
    page.getByRole("dialog", { name: reviewName, exact: true }),
  ).toContainText("Unnamed comp");
  await page
    .getByRole("dialog", { name: reviewName, exact: true })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await reviewImage(page, corrected);
  await openImage(page);
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Allies slot 5 notes")).toHaveValue(
    "  東京 🦊 é\t ",
  );
  await saveComp(page, "Sparse recovered");
  const empty = emptyComp();
  await expectLibraryComps(page, [
    {
      ...empty,
      name: "Sparse recovered",
      teams: {
        ally: [
          { heroId: null, notes: "" },
          { heroId: "deadpool", deadpoolRole: "Duelist", notes: "" },
          { heroId: null, notes: "" },
          { heroId: null, notes: "" },
          { heroId: null, notes: "  東京 🦊 é\t " },
          { heroId: null, notes: "" },
        ],
        enemy: empty.teams.enemy,
      },
      draft: setDraftHero(
        setDraftHero(
          emptyDraft("ignite"),
          { team: "enemy", kind: "ban", index: 4 },
          "hulk",
        ),
        { team: "ally", kind: "save", index: 1 },
        "luna",
      ),
    },
  ]);
});

test("a comp survives PNG, JPEG, and WebP copies of a real half-size screenshot", async ({
  page,
  context,
}, testInfo) => {
  await page.goto("/builder");
  const notes = Array.from({ length: 100 }, (_, index) =>
    createHash("sha256").update(`image screenshot ${index}`).digest("base64"),
  ).join("\n");
  await page.getByLabel("Comp name", { exact: true }).fill("Screenshot plan");
  await page.getByLabel("Comp notes", { exact: true }).fill(notes);
  await page.getByRole("button", { name: "Comp map", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose comp map", exact: true })
    .getByRole("button", { name: "Midtown", exact: true })
    .click();
  await chooseHero(page, "Allies slot 2: Choose hero", "Deadpool · Duelist");
  await page.getByLabel("Allies slot 5 notes").fill("  東京 🦊 é\t ");
  await page.getByLabel("Draft format").selectOption("ignite");
  await chooseHero(page, "Opponents ban 5: Choose hero", "Hulk");
  await chooseHero(page, "Allies save 2: Choose hero", "Luna Snow");
  const empty = emptyComp();
  const snapshot: Comp = {
    ...empty,
    name: "Screenshot plan",
    mapId: "midtown",
    notes,
    teams: {
      ally: [
        { heroId: null, notes: "" },
        { heroId: "deadpool", deadpoolRole: "Duelist", notes: "" },
        { heroId: null, notes: "" },
        { heroId: null, notes: "" },
        { heroId: null, notes: "  東京 🦊 é\t " },
        { heroId: null, notes: "" },
      ],
      enemy: empty.teams.enemy,
    },
    draft: setDraftHero(
      setDraftHero(
        emptyDraft("ignite"),
        { team: "enemy", kind: "ban", index: 4 },
        "hulk",
      ),
      { team: "ally", kind: "save", index: 1 },
      "luna",
    ),
  };
  const image = await downloadImage(page);
  const display = await context.newPage();
  await display.setContent(
    `<style>body{margin:300px 48px 48px;background:rgb(48,112,144)}img{display:block}</style><img alt="Exported comp" src="data:image/png;base64,${image.toString("base64")}">`,
  );
  const dimensions = await display
    .getByAltText("Exported comp")
    .evaluate(async (element) => {
      if (!(element instanceof HTMLImageElement))
        throw new Error("The exported image is missing.");
      await element.decode();
      element.style.width = `${element.naturalWidth / 2}px`;
      return { width: element.naturalWidth, height: element.naturalHeight };
    });
  await display.setViewportSize({
    width: Math.ceil(dimensions.width / 2) + 96,
    height: 900,
  });
  const screenshot = await display.screenshot({ fullPage: true });
  await testInfo.attach("half-size screenshot", {
    body: screenshot,
    contentType: "image/png",
  });
  await display.close();
  const formats: readonly ImageMimeType[] = [
    "image/png",
    "image/jpeg",
    "image/webp",
  ];
  const saved: Comp[] = [];
  for (const mimeType of formats) {
    const copy =
      mimeType === "image/png"
        ? screenshot
        : await reencodePixels(page, screenshot, false, mimeType);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "New comp", exact: true }).click();
    await reviewImage(page, copy, mimeType);
    await openImage(page);
    await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
      "Screenshot plan",
    );
    await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
      notes,
    );
    const name = `Screenshot ${mimeType}`;
    await saveComp(page, name);
    saved.unshift({ ...snapshot, name });
    await expectLibraryComps(page, saved);
  }
});

async function mutateStrip(
  page: Page,
  source: Buffer,
  kind: "unsupported" | "correctable",
): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ({ source, kind }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot change the exported strip cells.");
      context.drawImage(image, 0, 0);
      const railPixels = context.getImageData(
        Math.floor(canvas.width / 2),
        0,
        1,
        canvas.height,
      ).data;
      let railTop = -1;
      const isRail = (y: number): boolean =>
        railPixels[y * 4] === 48 &&
        railPixels[y * 4 + 1] === 112 &&
        railPixels[y * 4 + 2] === 144;
      for (let y = canvas.height - 1; y >= 0; y--) {
        if (!isRail(y)) continue;
        while (y > 0 && isRail(y - 1)) y--;
        railTop = y;
        break;
      }
      if (railTop < 0) throw new Error("The export has no locator rail.");
      const columns = Math.floor((canvas.width - 80) / 24) * 6;
      const left = Math.floor((canvas.width - columns * 4) / 2);
      const paint = (index: number, value: number): void => {
        context.fillStyle = `rgb(${value},${value},${value})`;
        context.fillRect(
          left + (index % columns) * 4,
          railTop + 8 + Math.floor(index / columns) * 4,
          4,
          4,
        );
      };
      if (kind === "unsupported") {
        [104, 200, 104, 56, 56, 56].forEach((value, index) =>
          paint(24 + index, value),
        );
      } else {
        const index = 48 * 6;
        const value = context.getImageData(
          left + (index % columns) * 4 + 2,
          railTop + 8 + Math.floor(index / columns) * 4 + 2,
          1,
          1,
        ).data[0];
        const alternate: Readonly<Record<number, number>> = {
          56: 104,
          104: 56,
          152: 200,
          200: 152,
        };
        const changed = value === undefined ? undefined : alternate[value];
        if (changed === undefined)
          throw new Error("The export cell has no known gray level.");
        paint(index, changed);
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Cannot encode the changed strip."));
        }, "image/png");
      });
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    { source: source.toString("base64"), kind },
  );
  return Buffer.from(bytes);
}

async function transformExport(
  page: Page,
  source: Buffer,
): Promise<{
  readonly old: Buffer;
  readonly cropped: Buffer;
  readonly damaged: Buffer;
}> {
  const images = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    const encode = async (
      kind: "old" | "cropped" | "damaged",
    ): Promise<number[]> => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height =
        kind === "old"
          ? 100
          : image.naturalHeight - (kind === "cropped" ? 4 : 0);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot transform the exported image.");
      context.drawImage(image, 0, 0);
      if (kind === "damaged") {
        context.fillStyle = "#808080";
        context.fillRect(
          canvas.width / 3,
          canvas.height - 120,
          canvas.width / 3,
          120,
        );
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Cannot encode the transformed image."));
        }, "image/png");
      });
      return [...new Uint8Array(await blob.arrayBuffer())];
    };
    return {
      old: await encode("old"),
      cropped: await encode("cropped"),
      damaged: await encode("damaged"),
    };
  }, source.toString("base64"));
  return {
    old: Buffer.from(images.old),
    cropped: Buffer.from(images.cropped),
    damaged: Buffer.from(images.damaged),
  };
}

async function mixedCompImage(
  page: Page,
  sources: readonly Buffer[],
): Promise<Buffer> {
  const bytes = await page.evaluate(
    async (sources) => {
      const images = await Promise.all(
        sources.map(async (source) => {
          const image = new Image();
          image.src = `data:image/png;base64,${source}`;
          await image.decode();
          return image;
        }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = images.reduce(
        (width, image) => width + image.naturalWidth + 20,
        20,
      );
      canvas.height =
        Math.max(...images.map((image) => image.naturalHeight)) + 40;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot compose the two comp images.");
      context.fillStyle = "#08090a";
      context.fillRect(0, 0, canvas.width, canvas.height);
      let left = 20;
      for (const image of images) {
        context.drawImage(image, left, 20);
        left += image.naturalWidth + 20;
      }
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Cannot encode the two comp images."));
        }, "image/png");
      });
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    sources.map((source) => source.toString("base64")),
  );
  return Buffer.from(bytes);
}

function oversizedJpeg(): Buffer {
  const app1 = Buffer.alloc(65_537);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(65_535, 2);
  const frame = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x7d, 0x00, 0x7d, 0x00, 0x03, 0x01, 0x11,
    0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  ]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app1,
    frame,
    Buffer.from([0xff, 0xd9]),
  ]);
}

test("old, corrupt, and unsupported images preserve the current comp and library", async ({
  page,
}) => {
  await page.goto("/builder");
  await page.getByLabel("Comp notes", { exact: true }).fill("Saved notes");
  await saveComp(page, "Keep saved plan");
  const baseline = await exportCompLibrary(page);
  const exported = await downloadImage(page);
  await page
    .getByLabel("Comp name", { exact: true })
    .fill("Second exported plan");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Different exported notes");
  const secondExport = await downloadImage(page);
  const transformed = await transformExport(page, exported);
  await page.getByLabel("Comp name", { exact: true }).fill("Keep unsaved name");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Keep unsaved notes");
  const failures = [
    {
      name: "broken.png",
      image: Buffer.from("not an image"),
      message: "Choose a PNG, JPEG, or WebP comp image",
    },
    {
      name: "oversized.jpg",
      image: oversizedJpeg(),
      message: "This image is too large",
    },
    {
      name: "old.png",
      image: transformed.old,
      message: "No Rivals Lab comp data was found",
    },
    {
      name: "corrupt.png",
      image: transformed.damaged,
      message: "damaged or incomplete",
    },
    {
      name: "missing.png",
      image: transformed.cropped,
      message: "damaged or incomplete",
    },
    {
      name: "unsupported.png",
      image: await mutateStrip(page, exported, "unsupported"),
      message: "version is not supported",
    },
    {
      name: "mixed.png",
      image: await mixedCompImage(page, [exported, secondExport]),
      message: "This image contains different comps",
    },
  ];
  for (const failure of failures) {
    await page.getByLabel("Import comp image", { exact: true }).setInputFiles({
      name: failure.name,
      mimeType: failure.name.endsWith(".jpg") ? "image/jpeg" : "image/png",
      buffer: failure.image,
    });
    await expect(page.getByRole("alert")).toContainText(failure.message, {
      timeout: 20_000,
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
      "Keep unsaved name",
    );
    await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
      "Keep unsaved notes",
    );
    expect(await exportCompLibrary(page)).toBe(baseline);
  }
});
