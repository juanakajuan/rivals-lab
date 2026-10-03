import { expect, test } from "@playwright/test";

test("hero dialogs preserve selection, filters, and edits on cancel", async ({
  page,
}) => {
  await page.goto("/builder");
  const notes = page.getByLabel("Allies slot 1 notes", { exact: true });
  await notes.fill("Hold the corner.");
  const opener = page.getByRole("button", {
    name: "Allies slot 1: Choose hero",
    exact: true,
  });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Choose hero · Allies · Slot 1",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("hero-dialog.png") });
  const search = dialog.getByRole("searchbox", { name: "Find a hero" });
  await search.fill("strange");
  await page.mouse.click(4, 4);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(notes).toHaveValue("Hold the corner.");
  await opener.click();
  await expect(search).toHaveValue("");
  await search.fill("strange");
  await dialog
    .getByRole("button", { name: "Doctor Strange", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", {
      name: "Allies slot 1: Doctor Strange",
      exact: true,
    }),
  ).toBeFocused();
  await expect(notes).toHaveValue("Hold the corner.");
});

test("builder dialogs focus their input and return focus after closing or saving", async ({
  page,
}) => {
  await page.goto("/builder");
  const heroOpener = page.getByRole("button", {
    name: "Allies slot 1: Choose hero",
    exact: true,
  });
  await heroOpener.focus();
  await page.keyboard.press("Enter");
  const heroDialog = page.getByRole("dialog");
  await expect(
    heroDialog.getByRole("searchbox", { name: "Find a hero" }),
  ).toBeFocused();
  await heroDialog
    .getByRole("searchbox", { name: "Find a hero" })
    .fill("strange");
  const close = heroDialog.getByRole("button", { name: "Close dialog" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    heroDialog.getByRole("button", { name: "Doctor Strange", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(heroDialog).toBeHidden();
  await expect(heroOpener).toBeFocused();

  const saveAs = page.getByRole("button", { name: "Save As", exact: true });
  await saveAs.click();
  const nameDialog = page.getByRole("dialog", {
    name: "Save comp as",
    exact: true,
  });
  const name = nameDialog.getByLabel("Comp name", { exact: true });
  await expect(name).toBeFocused();
  await name.fill("   ");
  await expect(
    nameDialog.getByRole("button", { name: "Save name", exact: true }),
  ).toBeDisabled();
  await nameDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(nameDialog).toBeHidden();
  await expect(saveAs).toBeFocused();
  await expect(page.locator(".saved-comp")).toHaveCount(0);

  await saveAs.click();
  await name.fill("Keyboard comp");
  await name.press("Enter");
  await expect(nameDialog).toBeHidden();
  await expect(saveAs).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Load Keyboard comp", exact: true }),
  ).toBeVisible();
  const rename = page.getByRole("button", {
    name: "Rename Keyboard comp",
    exact: true,
  });
  await rename.click();
  const renameDialog = page.getByRole("dialog", {
    name: "Rename comp",
    exact: true,
  });
  const renamedName = renameDialog.getByLabel("Comp name", { exact: true });
  await expect(renamedName).toBeFocused();
  await renamedName.fill("Renamed comp");
  await renamedName.press("Enter");
  await expect(renameDialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Rename Renamed comp", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("searchbox", { name: "Search saved comps" })
    .fill("Renamed");
  await page
    .getByRole("button", { name: "Rename Renamed comp", exact: true })
    .click();
  await renamedName.fill("Another comp");
  await renamedName.press("Enter");
  await expect(renameDialog).toBeHidden();
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.locator(".saved-comp")).toHaveCount(0);
});

test("leaving the builder closes dialogs and preserves unsaved comp edits", async ({
  page,
}) => {
  await page.goto("/board");
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  const notes = page.getByLabel("Comp notes", { exact: true });
  await notes.fill("Keep this plan.");
  await page
    .getByRole("button", {
      name: "Allies slot 1: Choose hero",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Allies 0", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(notes).toHaveValue("Keep this plan.");
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goForward();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(notes).toHaveValue("Keep this plan.");
});
