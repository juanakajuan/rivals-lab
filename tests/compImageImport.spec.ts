import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { toBuffer } from "qrcode";
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

async function reviewImage(page: Page, buffer: Buffer): Promise<void> {
  await page.getByLabel("Import comp image", { exact: true }).setInputFiles({
    name: "comp.png",
    mimeType: "image/png",
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
): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ({ source, useClipboard }) => {
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
          canvas.toBlob((result) => {
            if (result) resolve(result);
            else reject(new Error("Cannot encode the exported pixels."));
          }, "image/png");
        });
        return [...new Uint8Array(await encoded.arrayBuffer())];
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    { source: [...source], useClipboard },
  );
  return Buffer.from(bytes);
}

test("image review preserves edits and imported Save creates a new exact comp", async ({
  page,
  context,
  browserName,
}) => {
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
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New comp", exact: true }).click();
  await reviewImage(page, image);
  await expect(
    page.getByRole("dialog", { name: reviewName, exact: true }),
  ).toContainText("Unnamed comp");
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

test("a multi-code image survives a real half-size screenshot with margins", async ({
  page,
  context,
}) => {
  await page.goto("/builder");
  const notes = Array.from({ length: 100 }, (_, index) =>
    createHash("sha256").update(`image screenshot ${index}`).digest("base64"),
  ).join("\n");
  await page.getByLabel("Comp name", { exact: true }).fill("Screenshot plan");
  await page.getByLabel("Comp notes", { exact: true }).fill(notes);
  const image = await downloadImage(page);
  const display = await context.newPage();
  await display.setContent(
    `<style>body{margin:48px;background:#c4d6e8}img{display:block}</style><img alt="Exported comp" src="data:image/png;base64,${image.toString("base64")}">`,
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
  await display.close();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "New comp", exact: true }).click();
  await reviewImage(page, screenshot);
  await openImage(page);
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    notes,
  );
  await saveComp(page, "Screenshot plan");
  await expectLibraryComps(page, [
    { ...emptyComp(), name: "Screenshot plan", notes },
  ]);
});

async function malformedCode(
  kind: "complete" | "unsupported" | "corrupt" | "missing",
  comp: Comp = { ...emptyComp(), name: "Rejected plan" },
): Promise<Buffer> {
  const source = Buffer.from(
    JSON.stringify(
      kind === "missing"
        ? { ...comp, notes: "Missing chunk notes. ".repeat(100) }
        : comp,
    ),
  );
  const chunk = source.subarray(0, 1500);
  const packet = Buffer.alloc(64 + chunk.length);
  packet.write("RVLC", 0, "ascii");
  packet.writeUInt8(kind === "unsupported" ? 2 : 1, 4);
  packet.writeUInt16BE(Math.ceil(source.length / 1500), 8);
  packet.writeUInt32BE(source.length, 12);
  packet.writeUInt32BE(source.length, 16);
  createHash("sha256").update(source).digest().copy(packet, 20);
  if (kind === "corrupt") packet.writeUInt8(packet.readUInt8(20) ^ 255, 20);
  chunk.copy(packet, 64);
  return toBuffer([{ mode: "byte", data: packet }], {
    type: "png",
    errorCorrectionLevel: "Q",
    margin: 4,
    scale: 4,
  });
}

async function mixedCompImage(page: Page): Promise<Buffer> {
  const codes = await Promise.all([
    malformedCode("complete", { ...emptyComp(), name: "First comp" }),
    malformedCode("complete", { ...emptyComp(), name: "Second comp" }),
  ]);
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
    codes.map((code) => code.toString("base64")),
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
  const oldImage = Buffer.from(
    await page.evaluate(async (source) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = 100;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Cannot crop the image code area.");
      context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("Cannot encode the old image."));
        }, "image/png");
      });
      return [...new Uint8Array(await blob.arrayBuffer())];
    }, exported.toString("base64")),
  );
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
      image: oldImage,
      message: "No Rivals Lab comp codes were found",
    },
    {
      name: "corrupt.png",
      image: await malformedCode("corrupt"),
      message: "damaged or incomplete",
    },
    {
      name: "unsupported.png",
      image: await malformedCode("unsupported"),
      message: "version is not supported",
    },
    {
      name: "missing.png",
      image: await malformedCode("missing"),
      message: "damaged or incomplete",
    },
    {
      name: "mixed.png",
      image: await mixedCompImage(page),
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
