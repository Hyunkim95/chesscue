import { expect, test } from "@playwright/test";

test("keeps training centered on games and review", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Training plan" }).click();

  await expect(
    page.getByRole("button", { name: "Play this focus game" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analyze latest game" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start playbook lesson" }),
  ).toHaveCount(0);
});
