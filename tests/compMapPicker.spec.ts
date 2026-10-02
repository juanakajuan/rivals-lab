import { expect, test, type Locator, type Page } from "@playwright/test";
import { exportCompLibrary } from "./compLibrary";
import {
  emptyComp,
  parseCompLibrary,
  serializeCompLibrary,
} from "../src/comps";

function picker(page: Page): Locator {
  return page.getByRole("dialog", { name: "Choose comp map", exact: true });
}

function trigger(page: Page): Locator {
  return page.getByRole("button", { name: "Comp map", exact: true });
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
  throw new Error(
    "Keyboard navigation did not reach the comp map picker control",
  );
}

async function chooseMap(page: Page, name: string): Promise<void> {
  await trigger(page).click();
  await picker(page)
    .getByRole("searchbox", { name: "Search maps", exact: true })
    .fill(name);
  await picker(page).getByRole("button", { name, exact: true }).click();
}

async function pickHero(page: Page, slot: string, hero: string): Promise<void> {
  await page.getByRole("button", { name: slot, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: hero, exact: true })
    .click();
}

test("comp picker shows every scenic map and a selectable Any map", async ({
  page,
}) => {
  await page.goto("/builder");
  await trigger(page).click();
  const dialog = picker(page);
  await expect(dialog.getByRole("button")).toHaveCount(18);
  const anyMap = dialog.getByRole("button", { name: "Any map", exact: true });
  await expect(anyMap).toBeFocused();
  await expect(anyMap).toHaveAttribute("aria-pressed", "true");
  await expect(anyMap.locator("img")).toHaveCount(0);
  await expect(
    anyMap.getByText("No map restriction", { exact: true }),
  ).toBeVisible();
  for (const [name, mode, imagePath] of [
    ["Birnin T’Challa", "Domination", "/map-previews/birnin-tchalla.webp"],
    ["Hell’s Heaven", "Domination", "/map-previews/hells-heaven.webp"],
    ["Krakoa", "Domination", "/map-previews/krakoa.webp"],
    ["Celestial Husk", "Domination", "/map-previews/celestial-husk.webp"],
    ["Yggdrasill Path", "Convoy", "/map-previews/yggdrasill-path.webp"],
    ["Spider-Islands", "Convoy", "/map-previews/spider-islands.webp"],
    ["Midtown", "Convoy", "/map-previews/midtown.webp"],
    ["Arakko", "Convoy", "/map-previews/arakko.webp"],
    [
      "Museum of Contemplation",
      "Convoy",
      "/map-previews/museum-of-contemplation.jpg",
    ],
    ["Thebes", "Convoy", "/map-previews/thebes.jpg"],
    ["Hall of Djalia", "Convergence", "/map-previews/hall-of-djalia.webp"],
    [
      "Symbiotic Surface",
      "Convergence",
      "/map-previews/symbiotic-surface.webp",
    ],
    ["Central Park", "Convergence", "/map-previews/central-park.webp"],
    ["Heart of Heaven", "Convergence", "/map-previews/heart-of-heaven.webp"],
    ["Shin-Shibuya", "Convergence", "/map-previews/shin-shibuya.webp"],
    ["Lower Manhattan", "Convergence", "/map-previews/lower-manhattan.jpg"],
  ] satisfies readonly (readonly [string, string, string])[]) {
    const card = dialog.getByRole("button", { name, exact: true });
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator(".map-picker-card-name")).toHaveText(name);
    await expect(card.locator(".map-picker-card-mode")).toHaveText(mode);
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
        throw new Error("Missing scenic image");
      const bounds = element.getBoundingClientRect();
      return {
        actual: bounds.width / bounds.height,
        natural: element.naturalWidth / element.naturalHeight,
      };
    });
    expect(ratios.actual).toBeCloseTo(ratios.natural, 2);
  }
  await dialog.getByRole("button", { name: "Midtown", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".selected-map-preview")).toHaveText(
    "Midtown · Convoy",
  );
  await expect(trigger(page)).toBeFocused();
  await chooseMap(page, "Any map");
  await expect(page.locator(".selected-map-neutral")).toHaveText("Any map");
  await page.getByLabel("Comp name", { exact: true }).fill("Any map plan");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const exported = await exportCompLibrary(page);
  expect(exported).toContain('"mapId": null');
});

test("current map and rejected reset preserve all draft data; accepted reset keeps heroes and notes", async ({
  page,
}) => {
  await page.goto("/builder");
  await chooseMap(page, "Midtown");
  await page.getByLabel("Comp name", { exact: true }).fill("Keep draft");
  await pickHero(page, "Allies slot 1: Choose hero", "Doctor Strange");
  await page.getByLabel("Allies slot 1 notes").fill("Hold corner");
  await page.getByLabel("Comp notes", { exact: true }).fill("Keep high ground");
  await page.getByLabel("Draft format").selectOption("mrc");
  await pickHero(page, "Allies ban 4: Choose hero", "Hulk");
  await pickHero(page, "Opponents save 2: Choose hero", "Luna Snow");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const before = parseCompLibrary(await exportCompLibrary(page)).map(
    (entry) => entry.comp,
  );
  let confirmations = 0;
  page.on("dialog", async (dialog) => {
    confirmations++;
    await dialog.dismiss();
  });
  await chooseMap(page, "Midtown");
  await expect(trigger(page)).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Saved Keep draft.");
  expect(confirmations).toBe(0);
  await chooseMap(page, "Thebes");
  await expect(picker(page)).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  expect(confirmations).toBe(1);
  await expect(page.locator(".selected-map-preview")).toHaveText(
    "Midtown · Convoy",
  );
  await expect(
    page.getByRole("button", { name: "Allies ban 4: Hulk", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Opponents save 2: Luna Snow",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(
    parseCompLibrary(await exportCompLibrary(page)).map((entry) => entry.comp),
  ).toEqual(before);
  page.removeAllListeners("dialog");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toBe(
      "Change map and reset its draft? Heroes and notes will stay.",
    );
    await dialog.accept();
  });
  await chooseMap(page, "Any map");
  await expect(page.locator(".selected-map-neutral")).toHaveText("Any map");
  await expect(
    page.getByRole("button", {
      name: "Allies ban 4: Choose hero",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Opponents save 2: Choose hero",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Clear (Allies|Opponents) (ban|save)/ }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Draft format")).toHaveValue("mrc");
  await expect(
    page.getByRole("button", {
      name: "Allies slot 1: Doctor Strange",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Allies slot 1 notes")).toHaveValue(
    "Hold corner",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep high ground",
  );
});

test("comp search matches apostrophes and modes, keeps the current map while typing, and selects Any map", async ({
  page,
}) => {
  await page.goto("/builder");
  await trigger(page).click();
  const dialog = picker(page);
  const search = dialog.getByRole("searchbox", {
    name: "Search maps",
    exact: true,
  });
  const hellsHeaven = dialog.getByRole("button", {
    name: "Hell’s Heaven",
    exact: true,
  });
  for (const query of ["  HELLS  ", "Hell's", "Hell’s"]) {
    await search.fill(query);
    await expect(dialog.locator(".map-picker-card")).toHaveCount(1);
    await expect(hellsHeaven).toBeVisible();
  }
  for (const [query, count] of [
    ["  CONVOY  ", 6],
    ["convergence", 6],
    ["domination", 4],
  ] satisfies readonly (readonly [string, number])[]) {
    await search.fill(query);
    await expect(dialog.locator(".map-picker-card")).toHaveCount(count);
  }
  await search.fill("unknown map");
  await expect(dialog.getByRole("status")).toHaveText(
    "No maps match your search.",
  );
  await expect(dialog.locator(".map-picker-card")).toHaveCount(0);
  await expect(trigger(page)).toHaveText("Any map");
  await search.fill("");
  await expect(dialog.locator(".map-picker-card")).toHaveCount(17);
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Any map", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await search.fill("hells");
  await tabInPicker(page, "Tab", hellsHeaven);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveText("Hell’s Heaven · Domination");
  await trigger(page).click();
  await expect(search).toHaveValue("");
  await expect(hellsHeaven).toBeFocused();
  await search.fill("any");
  await expect(hellsHeaven).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await expect(search).toHaveValue("");
  await expect(hellsHeaven).toBeFocused();
  await search.fill("restriction");
  await expect(dialog.locator(".map-picker-card")).toHaveCount(1);
  await tabInPicker(
    page,
    "Tab",
    dialog.getByRole("button", { name: "Any map", exact: true }),
  );
  await page.keyboard.press("Space");
  await expect(dialog).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(page.locator(".selected-map-neutral")).toHaveText("Any map");
});

test("keyboard selects maps, focuses the current card, and closes without edits", async ({
  page,
}) => {
  await page.goto("/builder");
  await trigger(page).focus();
  await page.keyboard.press("Enter");
  const dialog = picker(page);
  const anyMap = dialog.getByRole("button", { name: "Any map", exact: true });
  await expect(anyMap).toBeFocused();
  const close = dialog.getByRole("button", {
    name: "Close map picker",
    exact: true,
  });
  await tabInPicker(page, "Shift+Tab", close);
  await tabInPicker(page, "Tab", anyMap);
  const cards = dialog.locator(".map-picker-card");
  const cardCount = await cards.count();
  for (let index = 1; index < cardCount; index++) {
    await tabInPicker(page, "Tab", cards.nth(index));
  }
  const last = dialog.getByRole("button", {
    name: "Lower Manhattan",
    exact: true,
  });
  await expect(last).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.locator(".selected-map-preview")).toHaveText(
    "Lower Manhattan · Convergence",
  );
  await expect(trigger(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute("aria-pressed", "true");
  await expect(last.getByText("Selected", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await close.click();
  await expect(dialog).toBeHidden();
  await expect(trigger(page)).toBeFocused();
  await expect(page.locator(".selected-map-preview")).toHaveText(
    "Lower Manhattan · Convergence",
  );
});

for (const width of [320, 390]) {
  test.describe(`comp picker at ${width}px`, () => {
    test.use({ viewport: { width, height: 600 }, hasTouch: true });
    test("first opening keeps an imported last map visible after cold previews load", async ({
      page,
    }) => {
      await page.goto("/builder");
      await page.getByLabel("Import comps JSON").setInputFiles({
        name: "cold-map.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          serializeCompLibrary([
            {
              id: "cold-map",
              updatedAt: "2026-10-02T05:00:00.000Z",
              comp: {
                ...emptyComp(),
                name: "Cold map",
                mapId: "lower-manhattan",
              },
            },
          ]),
        ),
      });
      await page
        .getByRole("button", { name: "Load Cold map", exact: true })
        .click();
      await expect(trigger(page)).toHaveText("Lower Manhattan · Convergence");
      await trigger(page).tap();
      const dialog = picker(page);
      const last = dialog.getByRole("button", {
        name: "Lower Manhattan",
        exact: true,
      });
      await expect(last).toBeFocused();
      await page.waitForLoadState("networkidle");
      await expect
        .poll(() =>
          last
            .locator("img")
            .evaluate(
              (element) =>
                element instanceof HTMLImageElement &&
                element.complete &&
                element.naturalWidth > 0,
            ),
        )
        .toBe(true);
      await expect(last).toBeInViewport({ ratio: 1 });
      await expect(last.getByText("Selected", { exact: true })).toBeInViewport({
        ratio: 1,
      });
      await expect(
        dialog.getByRole("searchbox", { name: "Search maps", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(
        dialog.getByRole("button", { name: "Close map picker", exact: true }),
      ).toBeInViewport({ ratio: 1 });
    });
    test("full catalog scrolls without overflow and selected card and Close stay visible", async ({
      page,
    }) => {
      await page.goto("/builder");
      await trigger(page).tap();
      const dialog = picker(page);
      const last = dialog.getByRole("button", {
        name: "Lower Manhattan",
        exact: true,
      });
      await last.scrollIntoViewIfNeeded();
      expect(
        await dialog
          .locator(".map-picker-cards")
          .evaluate((element) => element.scrollTop > 0),
      ).toBe(true);
      await expect(last.locator(".map-picker-card-name")).toHaveText(
        "Lower Manhattan",
      );
      await last.tap();
      await trigger(page).tap();
      await expect(last).toBeFocused();
      await expect(last).toBeInViewport({ ratio: 1 });
      await expect(last.getByText("Selected", { exact: true })).toBeInViewport({
        ratio: 1,
      });
      const close = dialog.getByRole("button", {
        name: "Close map picker",
        exact: true,
      });
      await expect(close).toBeInViewport({ ratio: 1 });
      await expect(
        dialog.getByRole("searchbox", { name: "Search maps", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(
        dialog.getByRole("heading", { name: "Choose comp map", exact: true }),
      ).toBeInViewport({ ratio: 1 });
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
      await close.tap();
      await expect(trigger(page)).toBeFocused();
      await expect(trigger(page)).toHaveText("Lower Manhattan · Convergence");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  });
}

test("fallback cards preserve comp map and data on rejected replacement and transfer without hidden focus", async ({
  page,
}) => {
  await page.goto("/builder");
  const transfer = page.getByRole("button", {
    name: "Open on Position Board",
    exact: true,
  });
  await expect(transfer).toBeDisabled();
  await chooseMap(page, "Midtown");
  await pickHero(page, "Allies slot 1: Choose hero", "Hulk");
  await page.getByLabel("Comp notes", { exact: true }).fill("Keep these notes");
  await transfer.click();
  const fallback = page.getByRole("dialog", {
    name: "Choose a Position Board map",
    exact: true,
  });
  await expect(fallback).toContainText(
    "Midtown has no board image yet. Choose a supported map. The saved comp’s map will stay unchanged.",
  );
  await expect(fallback.getByRole("button")).toHaveCount(4);
  const first = fallback.getByRole("button", {
    name: "Intergalactic Empire of Wakanda: Birnin T'Challa",
    exact: true,
  });
  await expect(first).toBeFocused();
  await expect(fallback.getByRole("button", { pressed: true })).toHaveCount(0);
  for (const [name, src] of [
    [
      "Intergalactic Empire of Wakanda: Birnin T'Challa",
      "/maps/birnin-tchalla-domination.png",
    ],
    [
      "Hydra Charteris Base: Hell's Heaven",
      "/maps/hells-heaven-domination.png",
    ],
    ["Museum of Contemplation", "/maps/museum-of-contemplation-convoy.png"],
  ] satisfies readonly (readonly [string, string])[]) {
    await expect(
      fallback.getByRole("button", { name, exact: true }).locator("img"),
    ).toHaveAttribute("src", src);
  }
  const search = fallback.getByRole("searchbox", {
    name: "Search maps",
    exact: true,
  });
  await search.fill("  CONVOY  ");
  await expect(fallback.locator(".map-picker-card")).toHaveCount(1);
  await expect(
    fallback.getByRole("button", {
      name: "Museum of Contemplation",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".selected-map-preview")).toHaveText(
    "Midtown · Convoy",
  );
  await page.keyboard.press("Escape");
  await expect(fallback).toBeHidden();
  await expect(transfer).toBeFocused();
  await transfer.click();
  await expect(search).toHaveValue("");
  await expect(first).toBeFocused();
  await search.fill("museum");
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain(
      "Replace the current Position Board placements",
    );
    await dialog.dismiss();
  });
  await fallback
    .getByRole("button", { name: "Museum of Contemplation", exact: true })
    .click();
  await expect(fallback).toBeHidden();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(transfer).toBeFocused();
  await expect(page.locator(".selected-map-preview")).toHaveText(
    "Midtown · Convoy",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep these notes",
  );
  await page.getByRole("link", { name: "Position Board", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Intergalactic Empire of Wakanda: Birnin T'Challa",
  );
  await expect(
    page.getByRole("button", { name: "Allies 3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await transfer.click();
  await search.fill("convoy");
  page.once("dialog", (dialog) => dialog.accept());
  await fallback
    .getByRole("button", { name: "Museum of Contemplation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Museum of Contemplation",
  );
  await expect(
    page.getByRole("button", { name: "Allies 1", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Open on Position Board",
    ),
  ).toBe(false);
  await page
    .getByRole("link", { name: "Draft / Comp Builder", exact: true })
    .click();
  await expect(page.locator(".selected-map-preview")).toHaveText(
    "Midtown · Convoy",
  );
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep these notes",
  );
});
