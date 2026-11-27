import { expect, test, type Page } from "@playwright/test";

// Phase 1 acceptance (docs/design/board-first-redesign.md §8): Today → Play it
// → not-best move → Try again with ghost arrows → solve → Done → celebration
// → recap → Sky. A new player starts from the warm-up position.

const square = (page: Page, name: string) =>
  page.locator(`[role=gridcell][aria-label^="${name}"]`).first();

test.use({ viewport: { width: 360, height: 800 } });

test("a new player finds the warm-up idea on a retry and sees it recapped", async ({
  page,
}) => {
  await page.goto("/?ui=board-first");
  await expect(
    page.getByRole("heading", { name: "Warm-up position" }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Try the warm-up" }).click();
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({
    timeout: 30_000,
  });
  // Focus mode: the tabs hide and only ✕ remains.
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Leave this position" }),
  ).toBeVisible();

  // A not-best move: Rook answers on the board and names the tier.
  await square(page, "White rook on f1").click();
  await square(page, "Empty f2").click();
  const bubble = page.locator(".rook-bubble__text");
  await expect(bubble).toContainText("Something much stronger was here", {
    timeout: 30_000,
  });
  await expect(page.getByRole("list", { name: "Your tries" })).toContainText(
    "Rf2",
  );
  // Chips never name the answer before it is found.
  await expect(page.getByRole("group", { name: "Ask Rook" })).not.toContainText(
    "Qxg5",
  );

  await page.getByRole("button", { name: "↺ Try again" }).click();
  await expect(page.locator("[data-move-cue-arrow='f1:f2']")).toHaveCount(1);

  await square(page, "White queen on g4").click();
  await square(page, "Black pawn on g5").click();
  await expect(page.getByRole("button", { name: "Done ✓" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Why does it work?" }).click();
  await expect(bubble).toContainText("Qxg5+");

  await page.getByRole("button", { name: "Done ✓" }).click();
  const sheet = page.getByRole("dialog", { name: "Found it on a retry" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("+");
  await sheet.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "From your games today" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /See your sky/ }).click();
  await expect(page.getByRole("heading", { name: "Your sky" })).toBeVisible();
});
