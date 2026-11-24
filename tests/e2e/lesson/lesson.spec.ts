import { expect, test } from "@playwright/test";

test("runs a deterministic playbook lesson step", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Training plan" }).click();
  await page.getByRole("button", { name: "Start playbook lesson" }).click();

  await expect(
    page.getByRole("grid", { name: "Lesson position, White side" }),
  ).toBeVisible();
  await expect(page.getByText("Step 1: recognize")).toBeVisible();

  await page.getByLabel("Your answer").fill("b5");
  await page.getByRole("button", { name: "Check answer" }).click();

  await expect(
    page.getByRole("heading", { name: "That is the key detail" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue lesson" }).click();

  await expect(page.getByText("Step 2: predict")).toBeVisible();
  await expect(page.getByLabel("Content source")).toContainText(
    "Verified playbook wording",
  );
});
