import { expect, test } from "@playwright/test";
import { emptyComp, serializeCompLibrary, type Comp } from "../src/comps";

declare global {
  interface Window {
    imageCopyTest: {
      text: string[];
      writes: number;
      rejectWrite?: () => void;
    };
  }
}

test("copies a full PNG of unsaved content without changing saved data", async ({
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
          notes: "Hold the corner.",
        },
        ...empty.teams.ally.slice(1),
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
    window.imageCopyTest = { text: [], writes: 0 };
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      text,
      x,
      y,
      maxWidth,
    ) {
      window.imageCopyTest.text.push(text);
      if (maxWidth === undefined) fillText.call(this, text, x, y);
      else fillText.call(this, text, x, y, maxWidth);
    };
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
  await page.getByRole("button", { name: "Copy image", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText(
    "Image copied to clipboard.",
  );
  const result = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const png = items.find((item) => item.types.includes("image/png"));
    if (!png) throw new Error("No PNG on clipboard");
    const blob = await png.getType("image/png");
    const bitmap = await createImageBitmap(blob);
    const result = {
      width: bitmap.width,
      height: bitmap.height,
      bytes: [...new Uint8Array(await blob.arrayBuffer())],
      text: window.imageCopyTest.text,
      saved: localStorage.getItem("rivals-lab.comps.v1"),
    };
    bitmap.close();
    return result;
  });
  expect(result.saved).toBe(saved);
  expect(result.width).toBeGreaterThan(1000);
  expect(result.height).toBeGreaterThan(7000);
  const text = result.text.join("\n");
  for (const expected of [
    "Unsaved team plan",
    "Midtown",
    "Allies",
    "Opponents",
    "Deadpool · Strategist",
    "Doctor Strange",
    "Empty slot",
    "Hold the corner.",
    "Watch portal.",
    "Step 11",
    "Wolverine (pending joint ban)",
    "Not selected",
    "FINAL NOTE BELOW THE SCROLL AREA",
  ])
    expect(text).toContain(expected);
  for (const excluded of [
    "Saved comps",
    "Save As",
    "Choose hero",
    "Copy image",
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
  await page.getByRole("button", { name: "Copy image", exact: true }).click();
  const busy = page.getByRole("button", {
    name: "Copying image…",
    exact: true,
  });
  await expect(busy).toBeDisabled();
  await busy.dispatchEvent("click");
  await expect(page.getByRole("status")).not.toHaveText(
    "Image copied to clipboard.",
  );
  expect(await page.evaluate(() => window.imageCopyTest.writes)).toBe(1);
  await page.evaluate(() => window.imageCopyTest.rejectWrite?.());
  await expect(page.getByRole("alert")).toContainText(
    "Clipboard access was denied",
  );
  await expect(
    page.getByRole("button", { name: "Copy image", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "Keep this build",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("rivals-lab.comps.v1")),
  ).toBeNull();
});

test("reports unsupported image clipboard access", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", { value: undefined }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Draft / Comp Builder", exact: true })
    .click();
  await page.getByRole("button", { name: "Copy image", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Image clipboard access is not supported",
  );
  await expect(page.getByRole("status")).not.toHaveText(
    "Image copied to clipboard.",
  );
});
