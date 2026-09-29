import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { emptyComp, serializeCompLibrary, type Comp } from "../src/comps";

declare global {
  interface Window {
    imageCopyTest: {
      text: string[];
      writes: number;
      positions?: {
        readonly text: string;
        readonly x: number;
        readonly y: number;
      }[];
      rejectWrite?: () => void;
    };
  }
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
    mapId: "midtown",
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
    draft: {
      format: "mrc",
      firstTeam: "ally",
      choices: [
        "angela",
        "captain-america",
        "groot",
        "hulk",
        "magneto",
        "peni-parker",
        "rogue",
        "the-hood",
        "the-thing",
        "thor",
        "wolverine",
      ],
    },
  };
  const saved = serializeCompLibrary([
    { id: "image-test", updatedAt: "2026-09-28T00:00:00Z", comp },
  ]);
  await page.addInitScript((source) => {
    localStorage.setItem("rivals-lab.comps.v1", source);
    window.imageCopyTest = { text: [], writes: 0, positions: [] };
    for (const prototype of [
      CanvasRenderingContext2D.prototype,
      OffscreenCanvasRenderingContext2D.prototype,
    ]) {
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
    .getByRole("button", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Load Saved build", exact: true })
    .click();
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
        image.close();
      }
      const result = {
        pixelHashes,
        background: [...pixelContext.getImageData(0, 0, 1, 1).data],
        width: bitmap.width,
        height: bitmap.height,
        bytes: [...new Uint8Array(await blob.arrayBuffer())],
        text: window.imageCopyTest.text,
        positions: window.imageCopyTest.positions ?? [],
        saved: localStorage.getItem("rivals-lab.comps.v1"),
      };
      bitmap.close();
      return result;
    },
    [...downloaded],
  );
  expect(result.pixelHashes[0]).toBe(result.pixelHashes[1]);
  expect(
    result.text.filter(
      (line) => line === "RIVALS LAB  /  DRAFT & COMP BUILDER",
    ),
  ).toHaveLength(1);
  expect(result.saved).toBe(saved);
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
  const text = result.text.join("\n");
  for (const expected of [
    "Unsaved team plan",
    "Midtown",
    "Allies",
    "Opponents",
    "Deadpool",
    "Strategist",
    "Doctor Strange",
    "Empty slot",
    "Hold the corner.",
    "Watch portal.",
    "Empty slot note.",
    "Step 11",
    "Wolverine",
    "Pending joint ban",
    "FINAL NOTE BELOW THE SCROLL AREA",
  ])
    expect(text).toContain(expected);
  for (const excluded of [
    "Saved comps",
    "Save As",
    "Choose hero",
    "Download & Copy",
    "Reset draft",
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
    .getByRole("button", { name: "Draft / Comp Builder", exact: true })
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
  expect(
    await page.evaluate(() => localStorage.getItem("rivals-lab.comps.v1")),
  ).toBeNull();
});

test("downloads when image clipboard access is unsupported", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", { value: undefined }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Draft / Comp Builder", exact: true })
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

test("image generation failure produces no download or clipboard image", async ({
  page,
}) => {
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.addInitScript(() => {
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
  });
  await page.route("**/compImageEncoder.worker.ts*", (route) => route.abort());
  await page.goto("/");
  await page
    .getByRole("button", { name: "Draft / Comp Builder", exact: true })
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
    .getByRole("button", { name: "Draft / Comp Builder", exact: true })
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
    draft: { format: "mrc", firstTeam: "ally", choices: [] },
  };
  await page.evaluate(
    (source) => localStorage.setItem("rivals-lab.comps.v1", source),
    serializeCompLibrary([
      { id: "sparse", updatedAt: "2026-09-28T00:00:00Z", comp: sparse },
    ]),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page.getByRole("button", { name: "Load Sparse", exact: true }).click();
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
    "Comp notes",
    "DRAFT ·",
  ])
    expect(sparseText).not.toContain(excluded);
});
