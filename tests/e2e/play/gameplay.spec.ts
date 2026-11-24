import { expect, test } from "@playwright/test";

test("plays a legal move and receives a CPU reply without live coaching", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("grid", { name: "Chess board, White side" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(/Your move/, {
    timeout: 10_000,
  });

  await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
  await page.getByRole("gridcell", { name: "Empty e4" }).click();

  await expect(
    page.getByRole("gridcell", { name: "White pawn on e4" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Your move", {
    timeout: 5_000,
  });
  const moveHistory = page.getByRole("list", { name: "Move history" });
  await expect(moveHistory.getByText("e4")).toBeVisible();
  await expect(moveHistory.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByText(/hint|evaluation|candidate|coach/i)).toHaveCount(
    0,
  );
});

test("resigns and offers another game", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText(/Your move/, {
    timeout: 10_000,
  });

  await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
  await page.getByRole("gridcell", { name: "Empty e4" }).click();
  await expect(page.getByRole("status")).toHaveText("Your move", {
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Resign game" }).click();

  await expect(
    page.getByRole("heading", { name: "Retry it, vary it, transfer it" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Back to training plan" }),
  ).toBeVisible();
});
