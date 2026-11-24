import { expect, test } from "@playwright/test";

test("loads the product shell", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Hanging Piece" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
});
