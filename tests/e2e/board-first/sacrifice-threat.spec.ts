import { expect, test } from "@playwright/test";

// A sacrifice is explained by the mate threat after the take-back only
// when the line declines it (owner approval, 28 November 2026). Puzzle
// 0jcmc's line takes back itself and wins the queen, so what it wins stays
// the point.
test("a sacrifice the line takes back keeps its material point", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#moment/puzzle%3A0jcmc");
  await expect(page.getByRole("heading", { name: /to move/ })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(page.locator(".rook-bubble__text")).toHaveText(
    "Rxh6+ wins a queen for a rook. It comes with check.",
    { timeout: 30_000 },
  );
});
