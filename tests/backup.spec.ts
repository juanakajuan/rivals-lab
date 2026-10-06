import { readFile } from "node:fs/promises";
import { expect, test, type Browser, type Page } from "@playwright/test";
import type Konva from "konva";
import { backupDialog, exportCompLibrary } from "./compLibrary";

declare global {
  interface Window {
    readonly Konva?: typeof Konva;
  }
}

async function frame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function uploadMap(page: Page): Promise<void> {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Missing fixture canvas");
    context.fillStyle = "#336699";
    context.fillRect(0, 0, 800, 400);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  if (!encoded) throw new Error("Cannot create image fixture");
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  await page.getByLabel("Upload map image", { exact: true }).setInputFiles({
    name: "scrim-map.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "scrim-map.png",
  );
}

async function addNote(page: Page, text: string): Promise<void> {
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page
    .getByRole("button", { name: "Add at center", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Note text", exact: true })
    .fill(text);
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByRole("button", { name: "Move", exact: true }).click();
}

async function dropHulk(page: Page): Promise<void> {
  const bounds = await page.locator(".stage-host canvas").first().boundingBox();
  if (!bounds) throw new Error("Missing board bounds");
  const dataTransfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData("application/x-rivals-hero", "hulk");
    data.setData("application/x-rivals-team", "ally");
    return data;
  });
  await page
    .locator(".stage-host canvas")
    .first()
    .dispatchEvent("drop", {
      dataTransfer,
      clientX: bounds.x + bounds.width / 4,
      clientY: bounds.y + bounds.height / 4,
    });
  await dataTransfer.dispose();
  await frame(page);
}

function boardNotes(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const konva = window.Konva;
    const stage = konva?.stages.find((item) =>
      item.container().matches(".stage-host"),
    );
    if (!konva || !stage) throw new Error("Missing board");
    return stage
      .find("Text")
      .flatMap((node) => (node instanceof konva.Text ? [node.text()] : []));
  });
}

async function openBuilder(page: Page): Promise<void> {
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
}

async function openBoard(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Position Board", exact: true }).click();
}

async function openBackup(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  await expect(backupDialog(page)).toBeVisible();
}

async function closeBackup(page: Page): Promise<void> {
  await backupDialog(page)
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(backupDialog(page)).toBeHidden();
}

async function downloadBackup(page: Page): Promise<string> {
  await openBackup(page);
  const downloadReady = page.waitForEvent("download");
  await backupDialog(page)
    .getByRole("button", { name: "Download full backup", exact: true })
    .click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toMatch(
    /^rivals-lab-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const path = await download.path();
  if (!path) throw new Error("The backup download has no file.");
  await closeBackup(page);
  return readFile(path, "utf8");
}

function jsonFile(name: string, text: string) {
  return { name, mimeType: "application/json", buffer: Buffer.from(text) };
}

async function chooseImport(
  page: Page,
  name: string,
  text: string,
): Promise<void> {
  await openBackup(page);
  await backupDialog(page)
    .getByLabel("Import backup or comps file", { exact: true })
    .setInputFiles(jsonFile(name, text));
}

async function freshPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await expect(page.locator(".stage-host canvas").first()).toBeVisible();
  return page;
}

/** Builds a workspace through the UI and leaves the open comp unsaved. */
async function buildWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await uploadMap(page);
  await addNote(page, "Hold the gate");
  await dropHulk(page);
  await page.getByRole("slider", { name: "Hero icon size" }).press("End");
  await openBuilder(page);
  await page.getByLabel("Comp name", { exact: true }).fill("Gate dive");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved Gate dive.");
  await page
    .getByLabel("Comp notes", { exact: true })
    .fill("Rotate after first pick.");
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
}

async function expectWorkspace(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "scrim-map.png",
  );
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 4",
  );
  await expect(
    page.getByRole("slider", { name: "Hero icon size" }),
  ).toHaveValue("150");
  await expect.poll(() => boardNotes(page)).toContain("Hold the gate");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await openBuilder(page);
  await expect(page.getByLabel("Comp name", { exact: true })).toHaveValue(
    "Gate dive",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Rotate after first pick.",
  );
  await expect(page.getByRole("status")).toHaveText("Unsaved changes");
  await expect(
    page.getByRole("button", { name: "Load Gate dive", exact: true }),
  ).toBeVisible();
  await openBoard(page);
}

test("a full backup restores the whole workspace in a fresh browser", async ({
  page,
  browser,
}) => {
  await buildWorkspace(page);
  const backup = await downloadBackup(page);

  const target = await freshPage(browser);
  await chooseImport(target, "rivals-lab-backup.json", backup);
  const dialog = backupDialog(target);
  await expect(
    dialog.getByRole("heading", {
      name: "Replace everything in this browser?",
    }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "has 1 saved comp, the open comp “Gate dive” (unsaved changes), a board on “scrim-map.png” with 7 heroes and 1 drawing on 1 map, 1 custom map image (less than 0.1 MB), and icon size 150%.",
  );
  await expect(dialog).toContainText(
    "This browser has 0 saved comps and 0 custom map images now. They will be replaced.",
  );
  const reloaded = target.waitForEvent("load");
  await dialog
    .getByRole("button", { name: "Replace browser data", exact: true })
    .click();
  await reloaded;
  await expectWorkspace(target);
  await target.reload();
  await expectWorkspace(target);
});

test("a comps file adds copies and a bad file changes nothing", async ({
  page,
  browser,
}) => {
  await buildWorkspace(page);
  const comps = await exportCompLibrary(page);
  const backup = await downloadBackup(page);

  const target = await freshPage(browser);
  await dropHulk(target);
  await chooseImport(target, "comps.json", comps);
  const dialog = backupDialog(target);
  await expect(
    dialog.getByRole("heading", { name: "Add 1 comp as copies?" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Add comps", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Imported 1 comp as copies.",
  );
  await closeBackup(target);
  await expect(target.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 4",
  );
  await expect(target.getByRole("heading", { level: 1 })).not.toHaveText(
    "scrim-map.png",
  );

  await chooseImport(target, "broken.json", backup.slice(0, -10));
  await expect(dialog.getByRole("alert")).toHaveText(
    "Import failed. This file is damaged or is not JSON.",
  );
  await closeBackup(target);
  await target.reload();
  await expect(target.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 4",
  );
  await openBuilder(target);
  await expect(
    target.getByRole("button", { name: "Load Gate dive", exact: true }),
  ).toBeVisible();
  await expect(target.getByLabel("Comp name", { exact: true })).toHaveValue("");
});
