import { expect, test } from "@playwright/test";

for (const path of ["/", "/board", "/unknown-page"]) {
  test(`${path} opens the board and keeps it after refresh`, async ({
    page,
  }) => {
    await page.goto(path);
    const boardLink = page.getByRole("link", {
      name: "Position Board",
      exact: true,
    });
    await expect(boardLink).toHaveAttribute("href", "/board");
    await expect(boardLink).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: "Clear", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(boardLink).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: "Clear", exact: true }),
    ).toBeVisible();
  });
}

test("builder direct loads and refresh keep the page without saving unsaved edits", async ({
  page,
}) => {
  await page.goto("/builder");
  const builderLink = page.getByRole("link", {
    name: "Draft / Comp Builder",
    exact: true,
  });
  await expect(builderLink).toHaveAttribute("href", "/builder");
  await expect(builderLink).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Comp notes", { exact: true }).fill("Unsaved note");
  await page.reload();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(builderLink).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue("");
});

test("links and Back/Forward keep both pages' in-session edits", async ({
  page,
}) => {
  await page.goto("/board");
  const boardLink = page.getByRole("link", {
    name: "Position Board",
    exact: true,
  });
  const builderLink = page.getByRole("link", {
    name: "Draft / Comp Builder",
    exact: true,
  });
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await builderLink.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/builder$/);
  await page.getByLabel("Comp notes", { exact: true }).fill("Keep this note");
  await builderLink.click();
  await page.goBack();
  await expect(page).toHaveURL(/\/board$/);
  await expect(boardLink).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("button", { name: "Allies 0", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeEnabled();
  await page.goForward();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep this note",
  );
  await boardLink.click();
  await expect(page).toHaveURL(/\/board$/);
  await expect(
    page.getByRole("button", { name: "Allies 0", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/builder$/);
  await expect(page.getByLabel("Comp notes", { exact: true })).toHaveValue(
    "Keep this note",
  );
});
