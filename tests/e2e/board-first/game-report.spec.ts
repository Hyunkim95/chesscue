import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 760 } });

test("opens a completed game report and replays its checked positions", async ({
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
  await page.getByRole("button", { name: "Open review" }).first().click();
  await page.getByRole("button", { name: "Full report" }).click();

  const board = page.getByRole("grid", { name: "Game report board" });
  await expect(board).toBeVisible();
  await expect(page.getByText("White accuracy")).toBeVisible({
    timeout: 25_000,
  });
  await expect(page.getByText("Black accuracy")).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Stockfish evaluation/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next move", exact: true }).click();
  await expect(
    board.getByRole("gridcell", { name: /White pawn on f3/ }),
  ).toBeVisible();
  await expect(
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).resolves.toBe(true);
  await page.screenshot({
    path: test.info().outputPath("full-report-320.png"),
  });
});
