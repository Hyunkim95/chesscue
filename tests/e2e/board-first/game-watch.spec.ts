import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 320, height: 760 } });

const square = (page: Page, name: string) =>
  page.locator(`[role=gridcell][aria-label^="${name}"]`).first();

test("an imported game replays to its report, stops at the player's win and opens it", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#import");
  await page
    .getByLabel("Paste completed PGN games")
    .fill(
      '[White "Maya"]\n[Black "Me"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
    );
  await page.getByRole("radio", { name: "I played Black" }).check();
  await page.getByRole("button", { name: "Import games", exact: true }).click();

  // One imported game opens at once and plays, with the win marked on the
  // timeline once Rook finds it.
  await expect(
    page.getByRole("heading", { level: 1, name: /You beat Maya/ }),
  ).toBeVisible({ timeout: 20_000 });
  await page
    .getByRole("button", { name: "Move 2: a chance you took" })
    .click({ timeout: 40_000 });

  // It stops before the win, without naming it.
  const bubble = page.locator(".rook-bubble__text");
  await expect(bubble).toHaveText("Maya played g4. Is there something here?");
  await page.screenshot({
    path: test.info().outputPath("stop-320.png"),
    animations: "disabled",
  });

  // Watching on to the end is the report.
  await page.getByRole("button", { name: "Keep watching" }).click();
  const win = page.getByRole("button", { name: /Move 2 · Qh4#/ });
  await expect(win).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("taken", { exact: true })).toBeVisible();
  await expect(page.getByText(/accuracy/i)).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("report-320.png"),
    animations: "disabled",
  });
  await win.click();

  // The moment is the same screen as Today; ✕ comes back to the game.
  await expect(
    page.getByRole("heading", { name: /Black to move/ }),
  ).toBeVisible({ timeout: 20_000 });
  await square(page, "Black queen on d8").click();
  await square(page, "Empty h4").click();
  await expect(page.getByRole("button", { name: "Done ✓" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(bubble).toContainText("You found Qh4# in the game too.");
  await page.getByRole("button", { name: "Done ✓" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("played it in a real game");
  await expect(sheet).toContainText(
    /You found Qh4# against Maya( on \w+)?, and again today\./,
  );
  await page.screenshot({
    path: test.info().outputPath("found-again-320.png"),
    animations: "disabled",
  });
  // Continue goes back to the game, at the moment.
  await sheet.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("button", { name: "Keep watching" }),
  ).toBeVisible();

  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await page.setViewportSize({ width: 420, height: 760 });
  await page.screenshot({
    path: test.info().outputPath("stop-420.png"),
    animations: "disabled",
  });
});
