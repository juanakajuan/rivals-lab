import { expect, test, type Locator, type Page } from "@playwright/test";

const wakanda = "Intergalactic Empire of Wakanda: Birnin T'Challa";
const hydra = "Hydra Charteris Base: Hell's Heaven";
const museum = "Museum of Contemplation";

function picker(page: Page): Locator {
  return page.getByRole("dialog", { name: "Choose map", exact: true });
}

function trigger(page: Page): Locator {
  return page.getByRole("button", { name: "Choose map", exact: true });
}

async function tabInPicker(
  page: Page,
  key: "Tab" | "Shift+Tab",
  control: Locator,
): Promise<void> {
  for (let step = 0; step < 8; step++) {
    await page.keyboard.press(key);
    expect(
      await picker(page).evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    if (
      await control.evaluate((element) => element === document.activeElement)
    ) {
      await expect(control).toBeFocused();
      return;
    }
  }
  throw new Error("Keyboard navigation did not reach the map picker control");
}

test("map cards show complete names and uncropped images; selection closes and restores focus", async ({
  page,
}) => {
  const requestedMaps: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/maps/")) requestedMaps.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".stage-host canvas").first()).toBeVisible();
  await expect(page.locator("#board-heading")).toHaveText(wakanda);
  expect(requestedMaps.some((url) => url.includes("hells-heaven"))).toBe(false);
  expect(requestedMaps.some((url) => url.includes("museum"))).toBe(false);
  await trigger(page).click();
  const dialog = picker(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".map-picker-card")).toHaveCount(3);
  await expect(
    dialog.getByRole("button", { name: "Upload image", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: wakanda, exact: true }),
  ).toBeFocused();

  for (const { name, mode, imagePath } of [
    {
      name: wakanda,
      mode: "Domination",
      imagePath: "/maps/birnin-tchalla-domination.png",
    },
    {
      name: hydra,
      mode: "Domination",
      imagePath: "/maps/hells-heaven-domination.png",
    },
    {
      name: museum,
      mode: "Convoy",
      imagePath: "/maps/museum-of-contemplation-convoy.png",
    },
  ]) {
    const card = dialog.getByRole("button", { name, exact: true });
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator(".map-picker-card-name")).toHaveText(name);
    await expect(card.locator(".map-picker-card-mode")).toHaveText(mode);
    await expect(card).toHaveAttribute(
      "aria-pressed",
      name === wakanda ? "true" : "false",
    );
    const image = card.locator("img");
    await expect(image).toHaveAttribute("src", imagePath);
    await expect
      .poll(() =>
        image.evaluate(
          (element) =>
            element instanceof HTMLImageElement &&
            element.complete &&
            element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const ratios = await image.evaluate((element) => {
      if (!(element instanceof HTMLImageElement))
        throw new Error("Missing map image");
      const bounds = element.getBoundingClientRect();
      return {
        actual: bounds.width / bounds.height,
        natural: element.naturalWidth / element.naturalHeight,
      };
    });
    expect(ratios.actual).toBeCloseTo(ratios.natural, 2);
  }
  await expect(dialog.getByText("Selected", { exact: true })).toHaveCount(1);
  await expect(
    dialog
      .getByRole("button", { name: wakanda, exact: true })
      .getByText("Selected", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: hydra, exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#board-heading")).toHaveText(hydra);
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  const selected = dialog.getByRole("button", { name: hydra, exact: true });
  await expect(selected).toBeFocused();
  await expect(selected).toHaveAttribute("aria-pressed", "true");
  await expect(selected.getByText("Selected", { exact: true })).toBeVisible();
});

test("native keyboard focus stays in the picker; Enter, Space, Escape and Close work", async ({
  page,
}) => {
  await page.goto("/");
  await trigger(page).focus();
  await page.keyboard.press("Enter");
  const dialog = picker(page);
  const current = dialog.getByRole("button", { name: wakanda, exact: true });
  const hydraCard = dialog.getByRole("button", { name: hydra, exact: true });
  const museumCard = dialog.getByRole("button", { name: museum, exact: true });
  const close = dialog.getByRole("button", {
    name: "Close map picker",
    exact: true,
  });
  await expect(current).toBeFocused();
  await tabInPicker(page, "Shift+Tab", close);
  await tabInPicker(page, "Tab", current);
  await tabInPicker(page, "Tab", hydraCard);
  await tabInPicker(page, "Tab", museumCard);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#board-heading")).toHaveText(museum);
  await expect(trigger(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(museumCard).toBeFocused();
  await tabInPicker(page, "Shift+Tab", hydraCard);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#board-heading")).toHaveText(hydra);
  await expect(trigger(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    dialog.getByRole("button", { name: hydra, exact: true }),
  ).toBeFocused();
  await tabInPicker(page, "Shift+Tab", current);
  await page.keyboard.press("Space");
  await expect(page.locator("#board-heading")).toHaveText(wakanda);
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#board-heading")).toHaveText(wakanda);
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await close.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#board-heading")).toHaveText(wakanda);
  await expect(trigger(page)).toBeFocused();
});

test("search matches names and modes without edits, recovers from no results, and resets on reopen", async ({
  page,
}) => {
  await page.goto("/");
  await trigger(page).click();
  const dialog = picker(page);
  const search = dialog.getByRole("searchbox", {
    name: "Search maps",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: wakanda, exact: true }),
  ).toBeFocused();
  await tabInPicker(page, "Shift+Tab", search);
  for (const query of ["  HELLS  ", "Hell's", "Hell’s"]) {
    await search.fill(query);
    await expect(dialog.locator(".map-picker-card")).toHaveCount(1);
    await expect(
      dialog.getByRole("button", { name: hydra, exact: true }),
    ).toBeVisible();
  }
  await search.fill("  CONVOY  ");
  await expect(dialog.locator(".map-picker-card")).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: museum, exact: true }),
  ).toBeVisible();
  await search.fill("domination");
  await expect(dialog.locator(".map-picker-card")).toHaveCount(2);
  await expect(
    dialog.getByRole("button", { name: wakanda, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await search.fill("unknown map");
  await expect(dialog.getByRole("status")).toHaveText(
    "No maps match your search.",
  );
  await expect(dialog.locator(".map-picker-card")).toHaveCount(0);
  await expect(page.locator("#board-heading")).toHaveText(wakanda);
  await search.fill("");
  await expect(dialog.locator(".map-picker-card")).toHaveCount(3);
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(search).toBeFocused();
  await page.keyboard.type("museum");
  const museumCard = dialog.getByRole("button", { name: museum, exact: true });
  await tabInPicker(page, "Tab", museumCard);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#board-heading")).toHaveText(museum);
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await expect(search).toHaveValue("");
  await expect(museumCard).toBeFocused();
  await search.fill("hydra");
  await expect(museumCard).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close map picker" }).click();
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await expect(search).toHaveValue("");
  await expect(museumCard).toBeFocused();
  await expect(museumCard).toHaveAttribute("aria-pressed", "true");
});

test("picker keys cannot undo, redo, delete or move board drawings", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page
    .getByRole("button", { name: "Add at center", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Note text", exact: true })
    .fill("Hold here");
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator(".stage-host").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveValue("New note");
  const boardPixels = (): Promise<string[]> =>
    page.locator(".stage-host canvas").evaluateAll((elements) =>
      elements.map((element) => {
        if (!(element instanceof HTMLCanvasElement))
          throw new Error("Missing board canvas");
        return element.toDataURL();
      }),
    );
  const before = await boardPixels();
  await trigger(page).click();
  await picker(page)
    .getByRole("searchbox", { name: "Search maps", exact: true })
    .fill("museum");
  for (const key of [
    "Control+z",
    "Meta+z",
    "Control+Shift+z",
    "Meta+Shift+z",
    "Control+y",
    "Delete",
    "Backspace",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
  ]) {
    await page.keyboard.press(key);
    await expect(picker(page)).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await boardPixels()).toEqual(before);
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveValue("New note");
  expect(await boardPixels()).toEqual(before);
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Note text", exact: true }),
  ).toHaveValue("Hold here");
});

for (const width of [390, 320]) {
  test.describe(`mobile picker at ${width}px`, () => {
    test.use({ viewport: { width, height: 600 }, hasTouch: true });
    test("full names wrap; cards scroll; selected last card and Close stay accessible", async ({
      page,
    }) => {
      await page.goto("/");
      await trigger(page).tap();
      const dialog = picker(page);
      for (const name of [wakanda, hydra, museum]) {
        const card = dialog.getByRole("button", { name, exact: true });
        await card.scrollIntoViewIfNeeded();
        await expect(card.locator(".map-picker-card-name")).toHaveText(name);
        const bounds = await card.boundingBox();
        if (!bounds) throw new Error("Missing map card");
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        const caption = await card
          .locator(".map-picker-card-details")
          .boundingBox();
        if (!caption) throw new Error("Missing map caption");
        expect(caption.y + caption.height).toBeLessThanOrEqual(
          bounds.y + bounds.height,
        );
      }
      const longName = dialog
        .getByRole("button", { name: wakanda, exact: true })
        .locator(".map-picker-card-name");
      expect(
        await longName.evaluate(
          (element) =>
            element.getBoundingClientRect().height >
            Number.parseFloat(getComputedStyle(element).fontSize) * 1.5,
        ),
      ).toBe(true);
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await dialog.getByRole("button", { name: museum, exact: true }).tap();
      await expect(dialog).toBeHidden();
      await expect(page.locator("#board-heading")).toHaveText(museum);
      await expect(trigger(page)).toBeFocused();
      await trigger(page).tap();
      await expect(
        dialog.getByRole("button", { name: museum, exact: true }),
      ).toBeFocused();
      await expect(
        dialog.getByRole("button", { name: museum, exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(
        dialog.getByText("Selected", { exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(
        dialog.getByRole("searchbox", { name: "Search maps", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      const close = dialog.getByRole("button", {
        name: "Close map picker",
        exact: true,
      });
      await expect(close).toBeInViewport();
      await expect(
        dialog.getByRole("heading", { name: "Choose map", exact: true }),
      ).toBeInViewport();
      await close.tap();
      await expect(dialog).toBeHidden();
      await expect(trigger(page)).toBeFocused();
      await expect(page.locator("#board-heading")).toHaveText(museum);
    });
  });
}
