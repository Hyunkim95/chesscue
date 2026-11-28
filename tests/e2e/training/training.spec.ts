import {
  generatedMove,
  squareLabel,
} from "../../../src/test/generated-position";
import { Chess } from "chess.js";
import { expect, test } from "@playwright/test";

test("plays a due practice position on the board and returns to rated play", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Rated game" })).toBeVisible();
  const boardStyle = () =>
    page.getByRole("grid").evaluate((board) => {
      const rook = board.querySelector(
        '[aria-label*="rook on"][role="gridcell"]',
      );
      const glyph = rook?.firstElementChild;
      const frame = board.closest(
        ".chess-board, .chessboard, .game-review-board-wrap",
      );
      if (!rook || !glyph || !frame)
        throw new Error("Board or piece is missing");
      const square = rook.getBoundingClientRect();
      const piece = glyph.getBoundingClientRect();
      return {
        border: getComputedStyle(frame).borderTopWidth,
        scale: piece.height / square.height,
        fits: piece.top >= square.top && piece.bottom <= square.bottom,
      };
    });
  const playBoard = await boardStyle();
  const chess = new Chess(),
    start = chess.fen(),
    move = chess.move("e4"),
    at = "2026-01-01T00:00:00Z";
  const game = {
    schemaVersion: 1,
    id: "reviewed-game",
    origin: { type: "tutor", mode: "coached", opponentElo: 1450 },
    initialFen: start,
    moves: [
      {
        ply: 1,
        uci: move.lan,
        san: move.san,
        fenAfter: move.after,
        playedAt: at,
      },
    ],
    pgn: chess.pgn(),
    playerColor: "white",
    result: "black-win",
    createdAt: at,
    completedAt: at,
    fingerprint: null,
    curriculumVersion: "1",
    configurationVersion: "1",
  };
  await page.evaluate(async (game) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("adaptive-chess-tutor");
      open.onerror = () => {
        reject(open.error ?? new Error("Opening review storage failed"));
      };
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction(
          ["games", "reviewEvidence"],
          "readwrite",
        );
        transaction.objectStore("games").put(game);
        transaction.objectStore("reviewEvidence").put({
          schemaVersion: 1,
          id: "practice-queue-fixture",
          gameId: "reviewed-game",
          analysisVersion: "stockfish-19-lite@1",
          theme: "one-move-threat",
          firstAttemptScore: 50,
          hardSpot: "Check their reply.",
          dueReview: "2026-01-02",
          reinforcement: "Find the strongest check.",
          transfer: "scheduled-next-game",
          completedAt: "2026-01-01T00:00:00Z",
        });
        transaction.onerror = () => {
          reject(transaction.error ?? new Error("Saving due practice failed"));
        };
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  }, game);
  await page.reload();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  const threat = page.getByRole("button", {
    name: /^See the opponent’s next threat/,
  });
  await threat.click();
  const practiceBoard = await boardStyle();
  expect(practiceBoard.border).toBe(playBoard.border);
  expect(practiceBoard.fits).toBe(true);
  expect(Math.abs(practiceBoard.scale - playBoard.scale)).toBeLessThan(0.025);

  const best = generatedMove("one-move-threat", "unlabeled").move;
  await page.getByRole("gridcell", { name: squareLabel(best.from) }).click();
  await page.getByRole("gridcell", { name: squareLabel(best.to) }).click();
  await expect(page.getByText("Good move", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("chesscue-due-practice:practice-queue-fixture"),
      ),
    )
    .toBe("done");

  await page.reload();
  await expect(page.getByRole("grid")).toBeVisible();
  await page
    .getByRole("button", { name: "Back to Practice", exact: true })
    .click();
  await expect(threat).toBeFocused();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Play", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Rated game", exact: true }),
  ).toBeVisible();
});

test("keeps personalized training empty for a new player", async ({ page }) => {
  await page.goto("/#skill-tree");
  await expect(
    page.getByText(
      "Play or import a completed game to get your first recommendation.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /recommended from your games/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Curriculum skill tree" }),
  ).toBeVisible();
});

test("keeps the Elo value and unit inside the rating card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto("/");
  for (let i = 0; i < 5; i++) {
    await expect(page.getByRole("status")).toHaveText("Your move");
    await page.getByRole("button", { name: "Resign game" }).click();
    await expect(page.getByRole("region", { name: "Your Elo" })).toBeVisible();
    if (i < 4)
      await page
        .getByRole("button", { name: "Play next placement game" })
        .click();
  }
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const card = page.getByRole("region", { name: "Your Elo" });

  for (const width of [1180, 780, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const elo = card.getByText(/^[\d,]+ ChessCue Elo$/);
    await expect(elo).toBeVisible();
    const bounds = await card.boundingBox();
    if (!bounds) throw new Error("Rating card missing");
    const text = await elo.evaluate(async (label) => {
      await document.fonts.ready;
      const range = document.createRange();
      range.selectNodeContents(label);
      const rects = Array.from(range.getClientRects());
      return {
        lineCount: new Set(rects.map((rect) => rect.top)).size,
        left: Math.min(...rects.map((rect) => rect.left)),
        right: Math.max(...rects.map((rect) => rect.right)),
      };
    });
    expect(text.lineCount, `Elo fits on one line at ${String(width)}px`).toBe(
      1,
    );
    expect(text.left).toBeGreaterThanOrEqual(bounds.x);
    expect(text.right).toBeLessThanOrEqual(bounds.x + bounds.width);
  }
});
