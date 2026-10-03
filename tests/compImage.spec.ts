import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { emptyDraft, setDraftHero } from "../src/draft";
import { emptyComp, serializeCompLibrary, type Comp } from "../src/comps";
import { exportCompLibrary, readStoredCompLibrary } from "./compLibrary";

declare global {
  interface Window {
    imageCopyTest: {
      text: string[];
      writes: number;
      bytes?: number[];
      positions?: {
        readonly text: string;
        readonly x: number;
        readonly y: number;
      }[];
      rejectWrite?: () => void;
    };
    imageFallbackTest: {
      bitmapCloses: number;
      workers: number;
      workerStops: number;
      localEncodes: number;
    };
  }
}

interface PngPixels {
  readonly hash: string;
  readonly background: readonly number[];
  readonly hasContent: boolean;
}

/** Decode exported pixels without using the worker and bitmap APIs under test. */
async function inspectPngs(
  sources: readonly (readonly number[])[],
): Promise<readonly PngPixels[]> {
  return Promise.all(
    sources.map(async (bytes) => {
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Cannot inspect PNG");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          image.width,
          image.height,
        ).data;
        const background = [...pixels.slice(0, 4)];
        const hash = await crypto.subtle.digest(
          "SHA-256",
          new Uint8Array(pixels),
        );
        return {
          hash: `${image.width}x${image.height}:${[...new Uint8Array(hash)].join(",")}`,
          background,
          hasContent: pixels.some(
            (channel, index) => channel !== background[index % 4],
          ),
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }),
  );
}

test("downloads and copies the same full PNG without changing saved data", async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const empty = emptyComp();
  const comp: Comp = {
    ...empty,
    name: "Saved build",
    mapId: "god-quarry",
    teams: {
      ally: [
        {
          heroId: "deadpool",
          deadpoolRole: "Strategist",
          notes:
            "Hold the corner.\n" +
            "W".repeat(180) +
            "\n" +
            "Hero line\n".repeat(25) +
            "FINAL HERO NOTE",
        },
        { heroId: null, notes: "Empty slot note." },
        { heroId: "groot", notes: "" },
        { heroId: "hulk", notes: "" },
        ...empty.teams.ally.slice(4),
      ],
      enemy: [
        { heroId: "strange", notes: "Watch portal." },
        ...empty.teams.enemy.slice(1),
      ],
    },
    draft: setDraftHero(
      setDraftHero(
        emptyDraft("mrc"),
        { team: "ally", kind: "ban", index: 3 },
        "wolverine",
      ),
      { team: "enemy", kind: "save", index: 1 },
      "luna",
    ),
  };
  const phasedComp = {
    ...comp,
    draft: setDraftHero(
      setDraftHero(
        comp.draft ?? emptyDraft("mrc"),
        { team: "ally", kind: "save", index: 0 },
        "groot",
      ),
      { team: "ally", kind: "ban", index: 1 },
      "angela",
    ),
  };
  const saved = serializeCompLibrary([
    { id: "image-test", updatedAt: "2026-09-28T00:00:00Z", comp: phasedComp },
  ]);
  await page.addInitScript((source) => {
    localStorage.setItem("rivals-lab.comps.v1", source);
    window.imageCopyTest = { text: [], writes: 0, positions: [] };
    for (const prototype of [
      CanvasRenderingContext2D.prototype,
      OffscreenCanvasRenderingContext2D.prototype,
    ]) {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- The wrapper supplies the canvas receiver with call.
      const fillText = prototype.fillText;
      prototype.fillText = function (text, x, y, maxWidth) {
        window.imageCopyTest.text.push(text);
        window.imageCopyTest.positions?.push({ text, x, y });
        if (maxWidth === undefined) fillText.call(this, text, x, y);
        else fillText.call(this, text, x, y, maxWidth);
      };
    }
  }, saved);
  await page.goto("/");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load Saved build", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Loaded Saved build.");
  await page.getByLabel("Comp name", { exact: true }).fill("Unsaved team plan");
  const notes =
    "Keep the high ground.\n".repeat(270) + "FINAL NOTE BELOW THE SCROLL AREA";
  await page.getByLabel("Comp notes", { exact: true }).fill(notes);
  const downloadReady = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download & Copy", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText(
    "Download started. Image copied to clipboard.",
  );
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe("Unsaved-team-plan.png");
  const path = testInfo.outputPath("build.png");
  await download.saveAs(path);
  const downloaded = await readFile(path);
  const result = await page.evaluate(
    async (downloaded) => {
      const items = await navigator.clipboard.read();
      const png = items.find((item) => item.types.includes("image/png"));
      if (!png) throw new Error("No PNG on clipboard");
      const blob = await png.getType("image/png");
      const bitmap = await createImageBitmap(blob);
      const pixelContext = new OffscreenCanvas(1, 1).getContext("2d");
      if (!pixelContext) throw new Error("Cannot inspect image background");
      pixelContext.drawImage(bitmap, 0, 0);
      const pixelHashes: string[] = [];
      const preview = document.querySelector(".selected-map-preview img");
      if (!(preview instanceof HTMLImageElement))
        throw new Error("Missing selected map preview");
      await preview.decode();
      const mapCanvas = new OffscreenCanvas(1600, 320);
      const mapContext = mapCanvas.getContext("2d");
      if (!mapContext) throw new Error("Cannot inspect map pixels");
      mapContext.fillStyle = "#08090a";
      mapContext.fillRect(0, 0, 1600, 320);
      const scale = Math.min(
        1520 / preview.naturalWidth,
        320 / preview.naturalHeight,
      );
      const mapWidth = preview.naturalWidth * scale;
      const mapHeight = preview.naturalHeight * scale;
      mapContext.drawImage(
        preview,
        (1600 - mapWidth) / 2,
        0,
        mapWidth,
        mapHeight,
      );
      const expectedMapHash = [
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new Uint8Array(mapContext.getImageData(0, 0, 1600, 320).data),
          ),
        ),
      ].join(",");
      const mapHashes: string[] = [];
      for (const source of [
        blob,
        new Blob([new Uint8Array(downloaded)], { type: "image/png" }),
      ]) {
        const image = await createImageBitmap(source);
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Cannot compare PNG images");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(
          0,
          0,
          image.width,
          image.height,
        ).data;
        const hash = await crypto.subtle.digest(
          "SHA-256",
          new Uint8Array(pixels),
        );
        pixelHashes.push(
          `${image.width}x${image.height}:${[...new Uint8Array(hash)].join(",")}`,
        );
        const mapHash = await crypto.subtle.digest(
          "SHA-256",
          new Uint8Array(context.getImageData(0, 170, 1600, 320).data),
        );
        mapHashes.push([...new Uint8Array(mapHash)].join(","));
        image.close();
      }
      const result = {
        pixelHashes,
        expectedMapHash,
        mapHashes,
        background: [...pixelContext.getImageData(0, 0, 1, 1).data],
        width: bitmap.width,
        height: bitmap.height,
        bytes: [...new Uint8Array(await blob.arrayBuffer())],
        text: window.imageCopyTest.text,
        positions: window.imageCopyTest.positions ?? [],
      };
      bitmap.close();
      return result;
    },
    [...downloaded],
  );
  expect(result.pixelHashes[0]).toBe(result.pixelHashes[1]);
  expect(result.mapHashes).toEqual([
    result.expectedMapHash,
    result.expectedMapHash,
  ]);
  expect(
    result.text.filter(
      (line) => line === "RIVALS LAB  /  DRAFT & COMP BUILDER",
    ),
  ).toHaveLength(1);
  expect(await exportCompLibrary(page)).toBe(saved);
  expect(result.background).toEqual([8, 9, 10, 255]);
  expect(result.width).toBeGreaterThan(1000);
  expect(result.height).toBeGreaterThan(2000);
  const finalHeroNote = result.positions.find(
    (entry) => entry.text === "FINAL HERO NOTE",
  );
  const nextRow = result.positions.find((entry) => entry.text === "4. Hulk");
  expect(finalHeroNote).toBeDefined();
  expect(nextRow).toBeDefined();
  if (!finalHeroNote || !nextRow) throw new Error("Missing hero card content");
  expect(finalHeroNote.x).toBeGreaterThan(60);
  expect(finalHeroNote.x).toBeLessThan(280);
  expect(finalHeroNote.y).toBeLessThan(nextRow.y - 65);
  expect(result.text.filter((line) => line === "FINAL HERO NOTE")).toHaveLength(
    1,
  );
  expect(result.text.filter((line) => /^W+$/.test(line)).join("")).toBe(
    "W".repeat(180),
  );
  const save1 = result.positions.find((entry) => entry.text === "Save 1");
  const ban2 = result.positions.find((entry) => entry.text === "Ban 2");
  const ban4 = result.positions.find((entry) => entry.text === "Ban 4");
  if (!save1 || !ban2 || !ban4) throw new Error("Missing draft phase labels");
  expect(save1.y).toBe(ban2.y);
  expect(save1.x).toBeLessThan(ban2.x);
  expect(ban2.x).toBeLessThan(ban4.x);
  const text = result.text.join("\n");
  for (const expected of [
    "Unsaved team plan",
    "Map: The God Quarry · Domination",
    "Allies",
    "Opponents",
    "Deadpool",
    "Strategist",
    "Doctor Strange",
    "Empty slot",
    "Hold the corner.",
    "Watch portal.",
    "Empty slot note.",
    "Ban 4",
    "Wolverine",
    "Save 2",
    "Luna Snow",
    "FINAL NOTE BELOW THE SCROLL AREA",
  ])
    expect(text).toContain(expected);
  for (const excluded of [
    "Saved comps",
    "Save As",
    "Choose hero",
    "Download & Copy",
    "Reset draft",
    "Pending joint ban",
    "Step 11",
    "Ban 1",
  ])
    expect(text).not.toContain(excluded);
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    notes,
  );
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "Unsaved team plan",
  );
  await testInfo.attach("full-build.png", {
    body: Buffer.from(result.bytes),
    contentType: "image/png",
  });
});

test("prevents repeat writes and only reports success after the write", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.imageCopyTest = { text: [], writes: 0 };
    Object.defineProperty(navigator, "clipboard", {
      value: {
        write: () => {
          window.imageCopyTest.writes++;
          return new Promise<void>((_resolve, reject) => {
            window.imageCopyTest.rejectWrite = () =>
              reject(new DOMException("Denied", "NotAllowedError"));
          });
        },
      },
    });
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page.getByLabel("Comp name", { exact: true }).fill("Keep this build");
  let downloads = 0;
  page.on("download", () => downloads++);
  const downloadReady = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download & Copy", exact: true })
    .click();
  const busy = page.getByRole("button", {
    name: "Preparing image…",
    exact: true,
  });
  await expect(busy).toBeDisabled();
  await busy.dispatchEvent("click");
  await expect(page.getByRole("status")).not.toHaveText(
    "Image copied to clipboard.",
  );
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe("Keep-this-build.png");
  await expect(page.getByRole("status")).toHaveText(
    "Download started. Copying image…",
  );
  expect(downloads).toBe(1);
  expect(await page.evaluate(() => window.imageCopyTest.writes)).toBe(1);
  await page.evaluate(() => window.imageCopyTest.rejectWrite?.());
  await expect(page.getByRole("alert")).toContainText(
    "Clipboard access was denied",
  );
  await expect(
    page.getByRole("button", { name: "Download & Copy", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "Keep this build",
  );
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled();
  expect(await readStoredCompLibrary(page)).toBeNull();
});

test("downloads when image clipboard access is unsupported", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", { value: undefined }),
  );
  await page.goto("/");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page.getByLabel("Comp notes", { exact: true }).fill("Notes only.");
  const downloadReady = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download & Copy", exact: true })
    .click();
  expect((await downloadReady).suggestedFilename()).toBe("rivals-comp.png");
  await expect(page.getByRole("status")).toHaveText("Download started.");
  await expect(page.getByRole("alert")).toContainText(
    "Image clipboard access is not supported",
  );
  await expect(page.getByRole("status")).not.toHaveText(
    "Image copied to clipboard.",
  );
});

test("uses the intact local image when the encoder worker cannot load", async ({
  page,
}, testInfo) => {
  const saved = serializeCompLibrary([
    {
      id: "fallback-test",
      updatedAt: "2026-09-28T00:00:00Z",
      comp: { ...emptyComp(), name: "Saved plan" },
    },
  ]);
  await page.addInitScript((source) => {
    localStorage.setItem("rivals-lab.comps.v1", source);
    window.imageCopyTest = { text: [], writes: 0 };
    Object.defineProperty(navigator, "clipboard", {
      value: {
        write: async (items: ClipboardItem[]) => {
          const item = items[0];
          if (!item) throw new Error("Missing clipboard item");
          const blob = await item.getType("image/png");
          window.imageCopyTest.bytes = [
            ...new Uint8Array(await blob.arrayBuffer()),
          ];
          window.imageCopyTest.writes++;
        },
      },
    });
  }, saved);
  let failedWorkerLoads = 0;
  await page.route("**/*compImageEncoder.worker*", async (route) => {
    failedWorkerLoads++;
    await route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "Worker asset is no longer available.",
    });
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load Saved plan", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Loaded Saved plan.");
  await page.getByLabel("Comp name", { exact: true }).fill("Unsaved plan");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Keep these notes.");
  const downloadReady = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download & Copy", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Download started. Image copied to clipboard.",
  );
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe("Unsaved-plan.png");
  const path = testInfo.outputPath("fallback.png");
  await download.saveAs(path);
  const bytes = [...(await readFile(path))];
  const result = await page.evaluate(() => ({
    bytes: window.imageCopyTest.bytes,
    writes: window.imageCopyTest.writes,
  }));
  if (!result.bytes) throw new Error("Missing clipboard PNG");
  const [downloaded, copied] = await page.evaluate(inspectPngs, [
    bytes,
    result.bytes,
  ]);
  if (!downloaded || !copied) throw new Error("Missing PNG inspection");
  expect(failedWorkerLoads).toBe(1);
  expect(downloaded.hash).toBe(copied.hash);
  expect(downloaded.background).toEqual([8, 9, 10, 255]);
  expect(downloaded.hasContent).toBe(true);
  expect(result.writes).toBe(1);
  expect(await exportCompLibrary(page)).toBe(saved);
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "Unsaved plan",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep these notes.",
  );
});

const workerFailures = [
  "snapshot",
  "constructor",
  "postMessage",
  "messageerror",
  "error",
  "encoding",
  "invalid",
  "empty",
] as const;

for (const failure of workerFailures) {
  test(`preserves PNG pixels and cleans up after ${failure} failure`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", { value: undefined }),
    );
    await page.goto("/");
    await page
      .getByRole("link", { name: "Draft / Comp Builder", exact: true })
      .click();
    await page.getByLabel("Comp name", { exact: true }).fill("Intact build");
    await page
      .getByLabel("Comp notes", { exact: true })
      .fill("The full plan must remain in the PNG.");
    const referenceReady = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download & Copy", exact: true })
      .click();
    const referencePath = testInfo.outputPath("reference.png");
    await (await referenceReady).saveAs(referencePath);
    await expect(
      page.getByRole("button", { name: "Download & Copy", exact: true }),
    ).toBeEnabled();

    await page.evaluate((failure) => {
      window.imageFallbackTest = {
        bitmapCloses: 0,
        workers: 0,
        workerStops: 0,
        localEncodes: 0,
      };
      // eslint-disable-next-line @typescript-eslint/unbound-method -- The wrapper supplies the bitmap receiver with call.
      const close = ImageBitmap.prototype.close;
      ImageBitmap.prototype.close = function () {
        window.imageFallbackTest.bitmapCloses++;
        close.call(this);
      };
      // eslint-disable-next-line @typescript-eslint/unbound-method -- The wrapper supplies the canvas receiver with call.
      const convertToBlob = OffscreenCanvas.prototype.convertToBlob;
      OffscreenCanvas.prototype.convertToBlob = function (options) {
        window.imageFallbackTest.localEncodes++;
        return convertToBlob.call(this, options);
      };
      if (failure === "snapshot") {
        window.createImageBitmap = () =>
          Promise.reject(new Error("Cannot copy the canvas"));
      }
      class FailingWorker extends Worker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
          if (failure === "constructor")
            throw new Error("Cannot construct worker");
          super(scriptURL, options);
          window.imageFallbackTest.workers++;
        }

        override postMessage(message: unknown, transfer: Transferable[]): void;
        override postMessage(
          message: unknown,
          options?: StructuredSerializeOptions,
        ): void;
        override postMessage(
          message: unknown,
          options: Transferable[] | StructuredSerializeOptions = [],
        ): void {
          if (failure === "postMessage") throw new Error("Cannot send bitmap");
          if (Array.isArray(options)) super.postMessage(message, options);
          else super.postMessage(message, options);
          if (failure === "messageerror")
            queueMicrotask(
              () =>
                void this.onmessageerror?.call(
                  this,
                  new MessageEvent("messageerror"),
                ),
            );
        }

        override terminate(): void {
          window.imageFallbackTest.workerStops++;
          super.terminate();
        }
      }
      window.Worker = FailingWorker;
    }, failure);
    if (
      failure === "error" ||
      failure === "encoding" ||
      failure === "invalid" ||
      failure === "empty"
    ) {
      const response = {
        error: 'throw new Error("Worker encoding failed");',
        encoding:
          'postMessage("This browser could not create the PNG image.");',
        invalid: 'postMessage({ unexpected: "result" });',
        empty: 'postMessage(new Blob([], { type: "image/png" }));',
      }[failure];
      await page.route("**/*compImageEncoder.worker*", (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: `onmessage = (event) => {
            if (!(event.data instanceof ImageBitmap)) throw new Error("Missing bitmap");
            event.data.close();
            ${response}
          };`,
        }),
      );
    }
    const fallbackReady = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download & Copy", exact: true })
      .click();
    const fallbackPath = testInfo.outputPath("fallback.png");
    await (await fallbackReady).saveAs(fallbackPath);
    const cleanup = await page.evaluate(() => window.imageFallbackTest);
    expect(cleanup).toEqual({
      bitmapCloses: failure === "snapshot" ? 0 : 1,
      workers: failure === "snapshot" || failure === "constructor" ? 0 : 1,
      workerStops: failure === "snapshot" || failure === "constructor" ? 0 : 1,
      localEncodes: 1,
    });
    const [reference, fallback] = await page.evaluate(inspectPngs, [
      [...(await readFile(referencePath))],
      [...(await readFile(fallbackPath))],
    ]);
    if (!reference || !fallback) throw new Error("Missing PNG inspection");
    expect(fallback.hash).toBe(reference.hash);
    expect(fallback.background).toEqual([8, 9, 10, 255]);
    expect(fallback.hasContent).toBe(true);
    await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
      "Intact build",
    );
    await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
      "The full plan must remain in the PNG.",
    );
  });
}

test("map image failure reports the map and permits retry without changing saved data", async ({
  page,
}) => {
  const saved = serializeCompLibrary([
    {
      id: "map-error",
      updatedAt: "2026-09-28T00:00:00Z",
      comp: { ...emptyComp(), name: "Map plan", mapId: "midtown" },
    },
  ]);
  await page.addInitScript((source) => {
    localStorage.setItem("rivals-lab.comps.v1", source);
    window.imageCopyTest = { text: [], writes: 0 };
    Object.defineProperty(navigator, "clipboard", {
      value: {
        write: async (items: ClipboardItem[]) => {
          const item = items[0];
          if (!item) throw new Error("Missing clipboard item");
          await item.getType("image/png");
          window.imageCopyTest.writes++;
        },
      },
    });
  }, saved);
  await page.route("**/map-previews/midtown.webp", (route) => route.abort());
  await page.goto("/builder");
  await page
    .getByRole("button", { name: "Load Map plan", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Loaded Map plan.");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Keep these edits.");
  let downloads = 0;
  page.on("download", () => downloads++);
  const exportButton = page.getByRole("button", {
    name: "Download & Copy",
    exact: true,
  });
  await exportButton.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Could not create image. Midtown preview could not load. Try again.",
  );
  await expect(exportButton).toBeEnabled();
  expect(downloads).toBe(0);
  expect(await page.evaluate(() => window.imageCopyTest.writes)).toBe(0);
  expect(await readStoredCompLibrary(page)).toBe(saved);
  await expect(page.locator(".selected-map-preview")).toHaveText(
    "Midtown · Convoy",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep these edits.",
  );
  await page.unroute("**/map-previews/midtown.webp");
  const downloadReady = page.waitForEvent("download");
  await exportButton.click();
  expect((await downloadReady).suggestedFilename()).toBe("Map-plan.png");
  await expect(page.getByRole("status")).toHaveText(
    "Download started. Image copied to clipboard.",
  );
  expect(downloads).toBe(1);
  expect(await page.evaluate(() => window.imageCopyTest.writes)).toBe(1);
  expect(await readStoredCompLibrary(page)).toBe(saved);
});

test("image generation failure produces no download or clipboard image", async ({
  page,
}) => {
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.addInitScript(() => {
    window.imageCopyTest = { text: [], writes: 0 };
    OffscreenCanvas.prototype.convertToBlob = () =>
      Promise.reject(new Error("Local PNG encoding failed."));
    Object.defineProperty(navigator, "clipboard", {
      value: {
        write: async (items: ClipboardItem[]) => {
          const item = items[0];
          if (!item) throw new Error("Missing clipboard item");
          await item.getType("image/png");
          window.imageCopyTest.writes++;
        },
      },
    });
  });
  await page.route("**/compImageEncoder.worker.ts*", (route) => route.abort());
  await page.goto("/");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page
    .getByLabel("Comp name", { exact: true })
    .fill("Keep failed export");
  await page
    .getByRole("button", { name: "Download & Copy", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not create image.",
  );
  await expect(
    page.getByRole("button", { name: "Download & Copy", exact: true }),
  ).toBeEnabled();
  expect(downloads).toBe(0);
  expect(await page.evaluate(() => window.imageCopyTest.writes)).toBe(0);
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "Keep failed export",
  );
});

test("sparse export omits empty sections and rejects an empty build", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.imageCopyTest = { text: [], writes: 0 };
    Object.defineProperty(navigator, "clipboard", { value: undefined });
    for (const prototype of [
      CanvasRenderingContext2D.prototype,
      OffscreenCanvasRenderingContext2D.prototype,
    ]) {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- The wrapper supplies the canvas receiver with call.
      const fillText = prototype.fillText;
      prototype.fillText = function (text, x, y, maxWidth) {
        window.imageCopyTest.text.push(text);
        if (maxWidth === undefined) fillText.call(this, text, x, y);
        else fillText.call(this, text, x, y, maxWidth);
      };
    }
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.getByLabel("Comp notes", { exact: true }).fill("   ");
  await page
    .getByRole("button", { name: "Download & Copy", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Add a title, map, hero, draft choice, or note before exporting.",
  );
  expect(downloads).toBe(0);
  await page.getByLabel("Comp notes", { exact: true }).fill("Only the plan.");
  const downloadReady = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download & Copy", exact: true })
    .click();
  await downloadReady;
  await expect(page.getByRole("status")).toHaveText("Download started.");
  const text = await page.evaluate(() => window.imageCopyTest.text.join("\n"));
  expect(text).toContain("Only the plan.");
  for (const excluded of [
    "Allies",
    "Opponents",
    "Empty slot",
    "Not selected",
    "Untitled comp",
    "Incomplete",
    "FREE BUILD",
    "DRAFT ·",
    "No notes",
  ])
    expect(text).not.toContain(excluded);
  const empty = emptyComp();
  const sparse: Comp = {
    ...empty,
    name: "Sparse",
    teams: {
      ally: [
        {
          heroId: "deadpool",
          deadpoolRole: "Strategist",
          notes: "Stay close.",
        },
        ...empty.teams.ally.slice(1),
      ],
      enemy: [{ heroId: null, notes: "  \n " }, ...empty.teams.enemy.slice(1)],
    },
    draft: emptyDraft("mrc"),
  };
  await page.getByLabel("Import comps JSON").setInputFiles({
    name: "sparse.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      serializeCompLibrary([
        { id: "sparse", updatedAt: "2026-09-28T00:00:00Z", comp: sparse },
      ]),
    ),
  });
  await expect(page.getByRole("status")).toHaveText(
    "Imported 1 comp as copies.",
  );
  await page.reload();
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page.getByRole("button", { name: "Load Sparse", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Loaded Sparse.");
  const sparseDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download & Copy", exact: true })
    .click();
  await sparseDownload;
  const sparseText = await page.evaluate(() =>
    window.imageCopyTest.text.join("\n"),
  );
  for (const included of ["Allies", "Deadpool", "Strategist", "Stay close."])
    expect(sparseText).toContain(included);
  for (const excluded of [
    "Opponents",
    "Empty slot",
    "Not selected",
    "Comp Notes",
    "DRAFT ·",
  ])
    expect(sparseText).not.toContain(excluded);
});
