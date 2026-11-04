import { expect, test } from "@playwright/test";
import {
  boardPoint,
  clickToken,
  dropHero,
  openExampleBoard,
} from "./boardSetup";

test("placement, removal, and Clear restore in history order", async ({
  page,
}) => {
  await openExampleBoard(page);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  const allies = page.getByRole("button", { name: /^Allies/ });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await dropHero(page, "hulk", 500, 250);
  await expect(allies).toHaveText("Allies 4");
  await dropHero(page, "hulk", 500, 250);
  await clickToken(page, 500, 250, "right");
  await page.getByRole("menuitem", { name: "Remove Hulk" }).click();
  await expect(allies).toHaveText("Allies 3");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(allies).toHaveText("Allies 0");
  await undo.click();
  await expect(allies).toHaveText("Allies 3");
  await undo.click();
  await expect(allies).toHaveText("Allies 4");
  await clickToken(page, 500, 250, "right");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(allies).toHaveText("Allies 3");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".selection-summary")).toHaveCount(0);
  await expect(undo).toBeDisabled();
  for (const count of [4, 3, 0]) {
    await redo.click();
    await expect(allies).toHaveText(`Allies ${count}`);
  }
  await expect(redo).toBeDisabled();
});

test("one drag is one edit; selection and unchanged edits preserve redo", async ({
  page,
}) => {
  await openExampleBoard(page);
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  const start = await boardPoint(page, 270, 435);
  const end = await boardPoint(page, 350, 480);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(undo).toBeDisabled();
  await page.mouse.up();
  const moved = await page.locator(".coordinates").innerText();
  expect(moved).not.toBe("x 270, y 435");
  await undo.click();
  await expect(page.locator(".coordinates")).toHaveText("x 270, y 435");
  await expect(undo).toBeDisabled();
  await clickToken(page, 270, 435);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 4 });
  await page.mouse.move(start.x, start.y, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose map", exact: true })
    .getByRole("button", {
      name: "Intergalactic Empire of Wakanda: Birnin T'Challa",
      exact: true,
    })
    .click();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeEnabled();
  await redo.click();
  await clickToken(page, 350, 480);
  await expect(page.locator(".coordinates")).toHaveText(moved);
  await undo.click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(redo).toBeDisabled();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await undo.click();
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 3",
  );
  await expect(undo).toBeDisabled();
});

test("map changes restore clamped positions in the same step", async ({
  page,
}) => {
  await page.goto("/");
  const mapHeading = page.getByRole("heading", { level: 1 });
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose map", exact: true })
    .getByRole("button", { name: "Museum of Contemplation", exact: true })
    .click();
  await dropHero(page, "strange", 0, 700);
  await expect(page.locator(".coordinates")).toHaveText("x 24, y 634");
  await page.getByRole("button", { name: "Choose map", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Choose map", exact: true })
    .getByRole("button", {
      name: "Intergalactic Empire of Wakanda: Birnin T'Challa",
      exact: true,
    })
    .click();
  await expect(page.locator(".coordinates")).toHaveText("x 24, y 630");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(mapHeading).toHaveText("Museum of Contemplation");
  await expect(page.locator(".coordinates")).toHaveText("x 24, y 634");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(mapHeading).toHaveText(
    "Intergalactic Empire of Wakanda: Birnin T'Challa",
  );
  await expect(page.locator(".coordinates")).toHaveText("x 24, y 630");
});

for (const modifier of ["Control", "Meta"]) {
  test(`${modifier} shortcuts preserve text editing and view state`, async ({
    page,
  }) => {
    await openExampleBoard(page);
    await dropHero(page, "hulk", 500, 250);
    const search = page.getByRole("searchbox");
    await search.fill("Hulk");
    await search.press("Backspace");
    await expect(search).toHaveValue("Hul");
    await search.press(`${modifier}+z`);
    await search.press(`${modifier}+Shift+z`);
    await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
      "Allies 4",
    );
    const prevented = await page.evaluate((key) => {
      const input = document.querySelector("input");
      if (!input) throw new Error("Missing search");
      const textarea = document.createElement("textarea");
      const editable = document.createElement("div");
      editable.contentEditable = "true";
      const child = document.createElement("span");
      editable.append(child);
      document.body.append(textarea, editable);
      const results = [input, textarea, child].flatMap((target) =>
        [
          { key: "z", shiftKey: false },
          { key: "z", shiftKey: true },
          { key: "y", shiftKey: false },
        ].map(({ key: shortcut, shiftKey }) => {
          const event = new KeyboardEvent("keydown", {
            key: shortcut,
            ctrlKey: key === "Control",
            metaKey: key === "Meta",
            shiftKey,
            bubbles: true,
            cancelable: true,
          });
          target.dispatchEvent(event);
          return event.defaultPrevented;
        }),
      );
      textarea.remove();
      editable.remove();
      return results;
    }, modifier);
    expect(prevented).toEqual(Array<boolean>(9).fill(false));
    await search.fill("Hulk");
    await page.getByRole("button", { name: /^Opponents/ }).click();
    await page.keyboard.press(`${modifier}+z`);
    await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
      "Allies 3",
    );
    await expect(page.locator(".selection-summary")).toHaveCount(0);
    await expect(search).toHaveValue("Hulk");
    await expect(
      page.getByRole("button", { name: /^Opponents/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press(`${modifier}+Shift+z`);
    await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
      "Allies 4",
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Redo", exact: true }),
    ).toBeDisabled();
  });
}

test("undo during a drag cancels the gesture without adding an edit", async ({
  page,
}) => {
  await openExampleBoard(page);
  await dropHero(page, "hulk", 500, 250);
  const start = await boardPoint(page, 270, 435);
  const end = await boardPoint(page, 350, 480);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.keyboard.press("Control+z");
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".coordinates")).toHaveText("x 270, y 435");
  await clickToken(page, 270, 435);
  await expect(page.locator(".selection-name strong")).toHaveText(
    "Doctor Strange",
  );
});

test("Ctrl+Y redoes a board edit and preserves native text history", async ({
  page,
}) => {
  await openExampleBoard(page);
  await dropHero(page, "hulk", 500, 250);
  const allies = page.getByRole("button", { name: /^Allies/ });
  await page.keyboard.press("Control+z");
  await expect(allies).toHaveText("Allies 3");
  const search = page.getByRole("searchbox");
  await search.pressSequentially("H");
  await search.press("Control+z");
  await expect(search).toHaveValue("");
  await search.press("Control+y");
  await expect(search).toHaveValue("H");
  await expect(allies).toHaveText("Allies 3");
  await page.getByRole("button", { name: /^Opponents/ }).click();
  await page.keyboard.press("Control+y");
  await expect(allies).toHaveText("Allies 4");
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeDisabled();
});
