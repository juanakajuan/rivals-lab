#!/usr/bin/env node
import { chromium, expect } from "@playwright/test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..", "..");
const flow = process.argv[2];
const port = process.env.VERIFY_PORT ?? "4181";
const base = `http://127.0.0.1:${port}`;
const out = join(root, "artifacts", "verify", flow ?? "unknown");
const PNG_SIGNATURE = "89504e470d0a1a0a";

function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok: ${message}`);
}

async function pickHero(page, slot, hero) {
  await page.getByRole("button", { name: slot, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: hero, exact: true })
    .click();
}

function boardPoint(board, x, y) {
  const scale = board.bounds.width / board.width;
  return { x: board.bounds.x + x * scale, y: board.bounds.y + y * scale };
}

async function boardBounds(page) {
  const host = page.locator(".stage-host").first();
  const bounds = await host.locator("canvas").first().boundingBox();
  check(bounds !== null, "board canvas has bounds");
  const width = Number(await host.getAttribute("data-map-width"));
  const height = Number(await host.getAttribute("data-map-height"));
  check(width > 0 && height > 0, "board reports its map size");
  return { bounds, width, height };
}

function coordinatesText(point) {
  return `x ${point.x}, y ${point.y}`;
}

async function expectCoordinatesNear(coordinates, point, board) {
  const tolerance = Math.ceil(board.width / board.bounds.width);
  await expect
    .poll(async () => {
      const match = /^x (\d+), y (\d+)$/.exec(await coordinates.innerText());
      if (!match) return Infinity;
      return Math.max(
        Math.abs(Number(match[1]) - point.x),
        Math.abs(Number(match[2]) - point.y),
      );
    })
    .toBeLessThanOrEqual(tolerance);
}

function navLink(page, name) {
  return page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name, exact: true });
}

const flows = {
  async "builder-save"(page) {
    const status = page.locator(".save-status");
    const name = page.getByLabel("Comp name", { exact: true });
    const caption = page.locator(".selected-map-preview figcaption");
    async function expectRestored() {
      await expect(name).toHaveValue("Verify plan");
      await expect(
        page.getByRole("button", {
          name: "Allies slot 1: Doctor Strange",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByLabel("Allies slot 1 notes")).toHaveValue(
        "Hold the corner.",
      );
      await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
        "Take high ground.",
      );
      await expect(caption).toHaveText("Midtown · Convoy");
    }

    await page.goto("/builder");
    await expect(status).toHaveText("New comp · not saved");
    await name.fill("Verify plan");
    await pickHero(page, "Allies slot 1: Choose hero", "Doctor Strange");
    await page.getByLabel("Allies slot 1 notes").fill("Hold the corner.");
    await page
      .getByLabel("Comp notes", { exact: true })
      .fill("Take high ground.");
    await page.getByRole("button", { name: "Comp map", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Choose comp map" })
      .getByRole("button", { name: "Midtown", exact: true })
      .click();
    await expect(caption).toHaveText("Midtown · Convoy");
    check(true, "map Midtown chosen");
    await page.screenshot({ path: join(out, "1-before-save.png") });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(status).toHaveText("Saved Verify plan.");
    check(true, "status reads Saved Verify plan.");

    await page.reload();
    await expectRestored();
    await expect(status).toHaveText("All changes saved");
    check(true, "open comp autosaves and comes back on reload without Load");

    await page.getByRole("button", { name: "New comp", exact: true }).click();
    await expect(status).toHaveText("New comp.");
    await expect(name).toHaveValue("");
    await page.reload();
    await expect(name).toHaveValue("");
    await page
      .getByRole("button", { name: "Load Verify plan", exact: true })
      .click();
    await expect(status).toHaveText("Loaded Verify plan.");
    await expectRestored();
    check(true, "Load Verify plan restores name, hero, notes, and map");
    await page.screenshot({ path: join(out, "2-after-load.png") });
  },

  async "board-undo"(page) {
    await page.goto("/board");
    const coordinates = page.locator(".coordinates");
    await page
      .getByRole("button", {
        name: "Add Doctor Strange to Allies",
        exact: true,
      })
      .click();
    await expect(page.locator(".selection-name strong")).toHaveText(
      "Doctor Strange",
    );
    const placed = /^x (\d+), y (\d+)$/.exec(await coordinates.innerText());
    check(placed !== null, "Doctor Strange has coordinates");
    const startToken = { x: Number(placed[1]), y: Number(placed[2]) };
    const startText = coordinatesText(startToken);
    await page.screenshot({ path: join(out, "1-selected.png") });
    const board = await boardBounds(page);
    const endToken = { x: startToken.x + 80, y: startToken.y + 45 };
    const start = boardPoint(board, startToken.x, startToken.y);
    const end = boardPoint(board, endToken.x, endToken.y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
    await expectCoordinatesNear(coordinates, endToken, board);
    const movedText = await coordinates.innerText();
    check(true, `drag moves token from ${startText} to ${movedText}`);
    await page.screenshot({ path: join(out, "2-moved.png") });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(coordinates).toHaveText(startText);
    check(true, "undo restores start position");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(coordinates).toHaveText(movedText);
    check(true, "redo restores moved position");
    await page.screenshot({ path: join(out, "3-redone.png") });
  },

  async "board-place"(page) {
    await page.goto("/board");
    const allies = page.getByRole("button", { name: /^Allies/ });
    const opponents = page.getByRole("button", { name: /^Opponents/ });
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    await expect(allies).toHaveText("Allies 0");
    await expect(opponents).toHaveText("Opponents 0");
    check(
      (await page
        .getByRole("button", { name: "Reset", exact: true })
        .count()) === 0,
      "a new board has no heroes and no Reset button",
    );
    await page.screenshot({ path: join(out, "0-empty.png") });
    await page
      .getByRole("button", { name: "Add Angela to Allies", exact: true })
      .click();
    await expect(allies).toHaveText("Allies 1");
    await expect(page.locator(".selection-name strong")).toHaveText("Angela");
    check(true, "Add Angela to Allies places and selects Angela");
    await page.screenshot({ path: join(out, "1-added.png") });
    await undo.click();
    await expect(allies).toHaveText("Allies 0");
    await redo.click();
    await expect(allies).toHaveText("Allies 1");
    check(true, "undo and redo apply to placement");
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(allies).toHaveText("Allies 0");
    await undo.click();
    await expect(allies).toHaveText("Allies 1");
    check(true, "Clear empties Allies and undo restores it");
    await page.reload();
    await expect(allies).toHaveText("Allies 1");
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    check(true, "board persists across reload; undo history does not");
    await page.screenshot({ path: join(out, "2-after-reload.png") });
  },

  async "export-png"(page) {
    await page.goto("/builder");
    await page.getByLabel("Comp name", { exact: true }).fill("Verify export");
    const ready = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download & Copy", exact: true })
      .click();
    const download = await ready;
    check((await download.failure()) === null, "download did not fail");
    check(
      download.suggestedFilename() === "Verify-export.png",
      "filename is Verify-export.png",
    );
    const file = join(out, "Verify-export.png");
    await download.saveAs(file);
    check(statSync(file).size > 1000, "PNG file is non-trivial in size");
    check(
      readFileSync(file).subarray(0, 8).toString("hex") === PNG_SIGNATURE,
      "file has the PNG signature",
    );
    const status = page.locator(".save-status");
    await expect(status).toHaveText(/^Download started\.(?!.*Copying)/);
    console.log(`status: ${await status.innerText()}`);
    await page.screenshot({ path: join(out, "1-status.png") });
  },

  async changelog(page) {
    const published = JSON.parse(
      readFileSync(join(root, "releases", "published.json"), "utf8"),
    );
    const dates = new Set(published.map((release) => release.date));
    const pendingDir = join(root, "releases", "pending");
    // Git drops the folder when a deploy publishes every note.
    const pending = (existsSync(pendingDir) ? readdirSync(pendingDir) : [])
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length));

    await page.goto("/builder");
    await navLink(page, "Changelog").click();
    await expect(page).toHaveURL(`${base}/changelog`);
    await expect(page).toHaveTitle("Changelog | Rivals Lab");
    await expect(navLink(page, "Changelog")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("heading", { name: "Changelog", level: 1 }),
    ).toBeVisible();
    check(true, "Changelog nav link opens the page");
    await expect(page.locator(".release-entry")).toHaveCount(dates.size);
    check(true, `one entry per published date (${dates.size})`);
    await expect(page.locator(".release-entry li").first()).toHaveText(
      published[0].notes[0].text,
    );
    check(true, "latest published note is first");
    for (const id of pending) {
      await expect(page.locator(`[data-note-id="${id}"]`)).toHaveCount(0);
    }
    check(true, `no pending note is shown (${pending.length} pending)`);
    await page.screenshot({ path: join(out, "1-changelog.png") });
  },

  async backup(page) {
    await page.goto("/board");
    await page
      .getByRole("button", { name: "Add Angela to Allies", exact: true })
      .click();
    await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
      "Allies 1",
    );
    await page.getByRole("button", { name: "Backup", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Back up everything in this browser",
    });
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: join(out, "1-dialog.png") });
    const ready = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Download full backup", exact: true })
      .click();
    const download = await ready;
    const filename = download.suggestedFilename();
    check(
      /^rivals-lab-backup-\d{4}-\d{2}-\d{2}\.json$/.test(filename),
      `filename is ${filename}`,
    );
    const file = join(out, filename);
    await download.saveAs(file);
    const backup = JSON.parse(readFileSync(file, "utf8"));
    check(backup.format === "rivals-lab-backup", "file is a Rivals Lab backup");
    check(
      backup.board?.tokens?.some((token) => token.heroId === "angela"),
      "backup holds the board tokens",
    );

    const fresh = await page
      .context()
      .browser()
      .newContext({
        baseURL: base,
        viewport: { width: 1280, height: 1000 },
      });
    try {
      const other = await fresh.newPage();
      await other.goto("/board");
      const allies = other.getByRole("button", { name: /^Allies/ });
      await expect(allies).toHaveText("Allies 0");
      await other.getByRole("button", { name: "Backup", exact: true }).click();
      const input = other.getByLabel("Import backup or comps file", {
        exact: true,
      });
      const newer = join(out, "newer-version.json");
      writeFileSync(newer, JSON.stringify({ ...backup, version: 2 }));
      await input.setInputFiles(newer);
      await expect(other.getByRole("alert")).toContainText(
        "Import failed. This backup was made by a newer version",
      );
      check(true, "a backup from a newer version is refused");
      await input.setInputFiles(file);
      await expect(
        other.getByRole("heading", {
          name: "Replace everything in this browser?",
        }),
      ).toBeVisible();
      await other.screenshot({ path: join(out, "2-import-preview.png") });
      await Promise.all([
        other.waitForEvent("load"),
        other
          .getByRole("button", { name: "Replace browser data", exact: true })
          .click(),
      ]);
      await expect(allies).toHaveText("Allies 1");
      check(true, "import into a fresh browser restores the board");
      await other.screenshot({ path: join(out, "3-imported.png") });
    } finally {
      await fresh.close();
    }
  },

  async "board-zoom"(page) {
    await page.goto("/board");
    await page
      .getByRole("button", {
        name: "Add Doctor Strange to Allies",
        exact: true,
      })
      .click();
    const coordinates = page.locator(".coordinates");
    const placed = await coordinates.innerText();
    const level = page.locator(".zoom-level");
    const zoom = page.getByRole("group", { name: "Map zoom" });
    const fit = zoom.getByRole("button", { name: "Fit map", exact: true });
    await expect(level).toHaveText("100%");
    await expect(fit).toBeDisabled();
    await zoom.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(level).toHaveText("150%");
    await page.locator(".stage-host").focus();
    await page.keyboard.press("+");
    await expect(level).toHaveText("225%");
    await page.keyboard.press("-");
    await expect(level).toHaveText("150%");
    check(true, "Zoom in and the + and - keys change the zoom");
    const host = page.locator(".stage-host");
    const box = await host.boundingBox();
    check(box !== null, "board host has bounds");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
    await page.mouse.wheel(0, -200);
    await expect
      .poll(async () => parseInt(await level.innerText()))
      .toBeGreaterThan(150);
    check(true, "the scroll wheel zooms in");
    await page.screenshot({ path: join(out, "1-zoomed.png") });
    const before = await host.screenshot();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 - 60,
      box.y + box.height * 0.6,
      {
        steps: 6,
      },
    );
    await page.mouse.up();
    check(!before.equals(await host.screenshot()), "dragging the map pans it");
    await page.screenshot({ path: join(out, "2-panned.png") });
    await fit.click();
    await expect(level).toHaveText("100%");
    await expect(fit).toBeDisabled();
    const match = /^x (\d+), y (\d+)$/.exec(placed);
    check(match !== null, "Doctor Strange has coordinates");
    const point = boardPoint(
      await boardBounds(page),
      Number(match[1]),
      Number(match[2]),
    );
    await page.mouse.click(point.x, point.y);
    await expect(coordinates).toHaveText(placed);
    check(true, "Fit map returns to 100% and the pan moved no hero");
    await page.reload();
    await expect(level).toHaveText("100%");
    check(true, "zoom is not saved");
  },

  async routes(page) {
    await page.goto("/BUILDER/");
    await expect(page).toHaveURL(`${base}/builder`);
    await expect(page).toHaveTitle("Draft / Comp Builder | Rivals Lab");
    check(true, "/BUILDER/ opens the builder at /builder");
    await page.goto("/no-such-page");
    await expect(
      page.getByRole("heading", { name: "Page not found", level: 1 }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Page not found | Rivals Lab");
    check(true, "unknown URL shows Page not found");
    await page.screenshot({ path: join(out, "1-not-found.png") });
    await page
      .getByRole("link", { name: "Back to the Position Board", exact: true })
      .click();
    await expect(page).toHaveURL(`${base}/board`);
    await expect(navLink(page, "Position Board")).toHaveAttribute(
      "aria-current",
      "page",
    );
    check(true, "Back to the Position Board opens /board");
  },
};

if (!(flow in flows)) {
  console.error(`Usage: drive.mjs ${Object.keys(flows).join(" | ")}`);
  process.exit(2);
}

mkdirSync(out, { recursive: true });
rmSync(join(out, "failure.png"), { force: true });

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
);
const context = await browser.newContext({
  baseURL: base,
  acceptDownloads: true,
  viewport: { width: 1280, height: 1000 },
});
const page = await context.newPage();
const log = [];
page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));

try {
  await flows[flow](page);
  check(!log.some((l) => l.startsWith("pageerror")), "no uncaught page errors");
  console.log(`PASS ${flow}; evidence in ${out}`);
} catch (error) {
  await page
    .screenshot({ path: join(out, "failure.png") })
    .catch(() => undefined);
  console.error(String(error));
  process.exitCode = 1;
} finally {
  writeFileSync(join(out, "console.log"), log.join("\n"));
  await browser.close();
}
