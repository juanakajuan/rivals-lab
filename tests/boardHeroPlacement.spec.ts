import { expect, test } from "@playwright/test";

test("keyboard activation places a board hero", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  const angela = page.getByRole("button", { name: /Angela/ });
  await angela.focus();
  await angela.press("Enter");
  await expect(page.getByRole("button", { name: /^Allies/ })).toHaveText(
    "Allies 1",
  );
});
