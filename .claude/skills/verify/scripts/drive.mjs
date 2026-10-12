#!/usr/bin/env node
// Usage: drive.mjs <flow>   flows: builder-save | board-undo | export-png | changelog
// Drives the running verification server in a real Chromium and writes proof to artifacts/verify/<flow>/.
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..", "..");
const flow = process.argv[2];
const port = process.env.VERIFY_PORT ?? "4181";
const base = `http://127.0.0.1:${port}`;
const out = join(root, "artifacts", "verify", flow ?? "unknown");
mkdirSync(out, { recursive: true });
rmSync(join(out, "failure.png"), { force: true });

function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok: ${message}`);
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
);
const context = await browser.newContext({ baseURL: base, acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();
const log = [];
page.on("console", (m) => log.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));

async function pickHero(slot, hero) {
  await page.getByRole("button", { name: slot, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: hero, exact: true }).click();
}

try {
  if (flow === "builder-save") {
    await page.goto("/builder");
    await page.getByLabel("Comp name", { exact: true }).fill("Verify plan");
    await pickHero("Allies slot 1: Choose hero", "Doctor Strange");
    await page.getByLabel("Allies slot 1 notes").fill("Hold the corner.");
    await page.getByLabel("Comp notes", { exact: true }).fill("Take high ground.");
    await page.screenshot({ path: join(out, "1-before-save.png") });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Saved Verify plan." }).waitFor({ timeout: 5000 });
    check(true, "status reads Saved Verify plan.");
    await page.reload();
    await page.getByRole("button", { name: "Load Verify plan", exact: true }).click();
    check((await page.getByLabel("Comp name", { exact: true }).inputValue()) === "Verify plan", "name survives reload");
    check(await page.getByRole("button", { name: "Allies slot 1: Doctor Strange", exact: true }).isVisible(), "slot 1 hero survives reload");
    check((await page.getByLabel("Allies slot 1 notes").inputValue()) === "Hold the corner.", "slot note survives reload");
    check((await page.getByLabel("Comp notes", { exact: true }).inputValue()) === "Take high ground.", "comp notes survive reload");
    await page.screenshot({ path: join(out, "2-after-reload.png") });
  } else if (flow === "board-undo") {
    await page.goto("/board");
    const bounds = await page.locator(".stage-host canvas").first().boundingBox();
    check(bounds !== null, "board canvas has bounds");
    const scale = bounds.width / 1200;
    const x = bounds.x + 270 * scale;
    const y = bounds.y + 435 * scale;
    await page.mouse.click(x, y);
    check((await page.locator(".selection-name strong").innerText()) === "Doctor Strange", "token at 270,435 is Doctor Strange");
    const start = await page.locator(".coordinates").innerText();
    await page.screenshot({ path: join(out, "1-selected.png") });
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80 * scale, y + 45 * scale, { steps: 8 });
    await page.mouse.up();
    const moved = await page.locator(".coordinates").innerText();
    check(moved !== start, `drag moved token (${start} -> ${moved})`);
    await page.screenshot({ path: join(out, "2-moved.png") });
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    check((await page.locator(".coordinates").innerText()) === start, "undo restores start position");
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    check((await page.locator(".coordinates").innerText()) === moved, "redo restores moved position");
    await page.screenshot({ path: join(out, "3-redone.png") });
  } else if (flow === "export-png") {
    await page.goto("/builder");
    await page.getByLabel("Comp name", { exact: true }).fill("Verify export");
    const ready = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download & Copy", exact: true }).click();
    const download = await ready;
    check((await download.failure()) === null, "download did not fail");
    check(download.suggestedFilename() === "Verify-export.png", "filename is Verify-export.png");
    const file = join(out, "Verify-export.png");
    await download.saveAs(file);
    check(statSync(file).size > 1000, "PNG file is non-trivial in size");
    await page.screenshot({ path: join(out, "1-status.png") });
    await page.getByRole("status").filter({ hasText: "Download started." }).waitFor({ timeout: 5000 });
    console.log(`status: ${await page.getByRole("status").innerText()}`);
  } else if (flow === "changelog") {
    await page.goto("/changelog");
    check(await page.getByRole("link", { name: "Changelog", exact: true }).isVisible(), "Changelog nav link visible");
    await page.screenshot({ path: join(out, "1-changelog.png") });
  } else {
    throw new Error("Usage: drive.mjs builder-save | board-undo | export-png | changelog");
  }
  check(!log.some((l) => l.startsWith("pageerror")), "no uncaught page errors");
  console.log(`PASS ${flow}; evidence in ${out}`);
} catch (error) {
  await page.screenshot({ path: join(out, "failure.png") }).catch(() => undefined);
  console.error(String(error));
  process.exitCode = 1;
} finally {
  writeFileSync(join(out, "console.log"), log.join("\n"));
  await browser.close();
}
