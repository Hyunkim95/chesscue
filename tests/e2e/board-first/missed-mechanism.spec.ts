import { expect, test, type Page } from "@playwright/test";

// Once the answer is known, "why not" a safe try ends on why the answer
// works: the fork the try missed, drawn on the board.

const square = (page: Page, name: string) =>
  page.locator(`[role=gridcell][aria-label^="${name}"]`).first();

test.use({ viewport: { width: 320, height: 760 } });

test("why not a safe try ends on the fork it missed", async ({ page }) => {
  await page.goto("/?ui=board-first#moment/puzzle%3A0jcIg");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  const bubble = page.locator(".rook-bubble__text");
  const next = page.getByRole("button", { name: "Next step" });

  await square(page, "White rook on b8").click();
  await square(page, "Empty b7").click();
  await page
    .getByRole("button", { name: "Why not Rb7?" })
    .click({ timeout: 30_000 });
  while (await next.isEnabled()) await next.click();
  await expect(bubble).toContainText("You missed a chance to win my rook");
  await expect(bubble).not.toContainText("Nd4");

  await page.getByRole("button", { name: "Show me" }).click();
  await page.getByRole("button", { name: "Why not Rb7?" }).click();
  while (await next.isEnabled()) await next.click();
  await expect(bubble).toHaveText(
    "Nd4+ forks my king and rook, so after Ke5 you take the rook with Nxb3.",
  );
  await expect(page.locator("[data-move-cue-arrow='d4:e6']")).toHaveCount(1);
  await expect(page.locator("[data-move-cue-arrow='d4:b3']")).toHaveCount(1);
  await expect(square(page, "White knight on d4")).toBeVisible();
  await expect(square(page, "Black king on e6")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/missed-mechanism-320.png" });
});
