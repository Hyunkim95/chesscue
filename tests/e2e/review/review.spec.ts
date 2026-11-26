import { expect, test, type Page } from "@playwright/test";
import { Chess } from "chess.js";

const buildCompletedTutorGame = () => {
  const chess = new Chess();
  const initialFen = chess.fen();
  const playedAt = "2026-11-24T12:00:00.000Z";
  const moves = [
    "e4",
    "e5",
    "Nf3",
    "Nc6",
    "Bb5",
    "a6",
    "Bxc6",
    "dxc6",
    "d4",
    "exd4",
  ].map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      fenAfter: chess.fen(),
      playedAt,
    };
  });

  return {
    schemaVersion: 1,
    id: "review-e2e-game",
    origin: { type: "tutor" },
    initialFen,
    moves,
    pgn: chess.pgn(),
    playerColor: "white",
    result: "black-win",
    createdAt: playedAt,
    completedAt: "2026-11-24T12:10:00.000Z",
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    fingerprint: null,
  };
};

async function commitFirstLegalMove(
  page: Page,
  confirm: boolean,
): Promise<void> {
  const board = page.getByRole("grid", { name: /Training board/ });
  const cells = board.getByRole("gridcell");
  const count = await cells.count();
  for (let index = 0; index < count; index += 1) {
    await cells.nth(index).click();
    const targets = board.getByRole("gridcell", { name: /legal destination/ });
    if ((await targets.count()) > 0) {
      await targets.first().click();
      if (confirm)
        await page.getByRole("button", { name: "Play this move" }).click();
      return;
    }
  }
  throw new Error("No legal board move was available for the training set");
}

async function openReviewFromTraining(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Training plan" }).click();
  const reviewGame = page.getByText("Review this game", { exact: true });
  await expect(reviewGame).toBeAttached();
  const evidence = page.getByText("Show what Stockfish checked", {
    exact: true,
  });
  if (await evidence.isVisible()) await evidence.click();
  await reviewGame.click();
  await page
    .getByRole("button", { name: "Explore the turning point" })
    .click({ timeout: 30_000 });
}

test("plays from a verified learning moment and retains the original game", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Your move", {
    timeout: 10_000,
  });

  const record = buildCompletedTutorGame();
  await page.evaluate(async (game) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("adaptive-chess-tutor");
      request.onerror = () => {
        reject(request.error ?? new Error("Could not open IndexedDB"));
      };
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("games", "readwrite");
        transaction.objectStore("games").put(game);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error("Could not seed game"));
        };
      };
    });
  }, record);

  await page.setViewportSize({ width: 390, height: 844 });
  await openReviewFromTraining(page);

  await expect(
    page.getByRole("heading", {
      name: "Your game, rewound",
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: test.info().outputPath("rewind-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(
    page.getByRole("button", { name: "Back to training plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your Training Profile" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Rook commentary" }),
  ).toBeVisible();
  await expect(page.getByText(/Set 1 of/i)).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByText("Technical details")).toHaveCount(0);
  const board = page.getByRole("grid", { name: /Training board/ });
  await expect(board).toBeVisible();
  await expect(board).toBeInViewport({ ratio: 1 });
  const boardBalance = page.getByRole("group", { name: "Board balance" });
  await expect(boardBalance).not.toContainText("Position");
  const rowHeights = await board
    .locator(".chess-board__row")
    .evaluateAll((rows) =>
      rows.map((row) => row.getBoundingClientRect().height),
    );
  expect(rowHeights).toHaveLength(8);
  expect(Math.max(...rowHeights) - Math.min(...rowHeights)).toBeLessThan(1);

  await board.getByRole("gridcell", { name: /White knight on f3/ }).click();
  await board.getByRole("gridcell", { name: /Black pawn on e5/ }).click();
  await expect(
    board.getByRole("gridcell", { name: /^Black .*last move ended here$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Rook commentary" }),
  ).not.toContainText("Try a move");
  await expect(
    page.getByRole("region", { name: "Rook commentary" }),
  ).toContainText(/Stockfish/);
  await expect(
    page.getByRole("region", { name: "Rook commentary" }),
  ).toContainText(/\?/);
  await expect(board).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath("rewind-desktop.png") });
  await page.getByText("Why this matters").click();
  await expect(page.getByText(/^Feedback source:/)).toBeVisible();
  await page.getByText("Why this matters").click();
  await page.getByText("Technical details").click();
  await expect(page.getByText("Analysis version")).toBeVisible();

  const replay = page.getByText(
    /^Replay the (?:full game|game and saved coach notes)$/,
  );
  await replay.click();
  const moveSlider = page.getByRole("slider", {
    name: "Move through the game",
  });
  await moveSlider.press("End");
  const replayBalance = page
    .locator(".game-review__replay-content")
    .getByRole("group", { name: "Board balance" });
  await expect(
    replayBalance.getByRole("img", { name: "Captured knight" }),
  ).toBeVisible();
  await expect(
    replayBalance.getByRole("img", { name: /Captured bishop, pawn/ }),
  ).toBeVisible();
  await moveSlider.press("Home");
  await expect(replayBalance.getByRole("img")).toHaveCount(0);
  await replay.click();

  const closeAnalogue = page.getByRole("button", {
    name: "Try a similar position",
  });
  if ((await closeAnalogue.count()) > 0) {
    await closeAnalogue.click();
    await expect(
      page.getByText("Optional challenge", { exact: true }),
    ).toBeVisible();
    await commitFirstLegalMove(page, true);
    const practiceWithoutHint = page.getByRole("button", {
      name: "Practice without a hint",
    });
    if ((await practiceWithoutHint.count()) > 0) {
      await practiceWithoutHint.click();
      await expect(
        page.getByText("No hint this time", { exact: true }),
      ).toBeVisible();
      await commitFirstLegalMove(page, true);
    }
    await page.getByRole("button", { name: "Finish review" }).click();
  } else {
    await page.getByRole("button", { name: "Finish review" }).click();
  }

  await expect(
    page.getByRole("heading", { name: "Take one cue into the next game" }),
  ).toBeVisible();
  await expect(page.getByText("Your next-game cue")).toBeVisible();
  await expect(page.getByText(/%/)).toHaveCount(0);

  await page.getByRole("button", { name: "Back to training plan" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(
    page.getByText("Evidence from 0 imported games and 1 tutor game."),
  ).toBeVisible();
  await expect(page.getByText(/% observed score/).first()).toBeVisible();
});

async function openImportedReview(page: Page, fen: string, moves: string) {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Import games", exact: true })
    .click();
  await page
    .getByLabel("Paste completed PGN games")
    .fill(
      `[Event "Review example"]\n[SetUp "1"]\n[FEN "${fen}"]\n[Result "0-1"]\n\n${moves} 0-1`,
    );
  await page.getByRole("radio", { name: "I played White" }).check();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Import games", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Game debrief" })).toBeVisible(
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Explore the turning point" }).click();
}

test("lets the learner keep playing after the CPU responds to the queen exchange", async ({
  page,
  context,
}) => {
  const start = "3qk3/p4ppp/8/Q7/8/8/P4PPP/3K4 w - - 0 1";
  await openImportedReview(page, start, "1. Qxd8+ Kxd8");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.context().setOffline(true);
  const board = page.getByRole("grid", { name: "Training board, White side" });
  await board.getByRole("gridcell", { name: /White queen on a5/ }).click();
  await board.getByRole("gridcell", { name: /Black queen on d8/ }).click();
  await expect(
    board.getByRole("gridcell", {
      name: /Black king on d8, last move ended here/,
    }),
  ).toBeVisible();
  const rook = page.getByRole("region", { name: "Rook commentary" });
  await expect(rook).toContainText(/check.*(answer|legal|reply|respond)/i);
  await expect(rook).toContainText(/queens.*off the board/i);
  await expect(rook).toContainText(/material is level/i);
  await board.getByRole("gridcell", { name: /White pawn on a2/ }).click();
  await board
    .getByRole("gridcell", { name: /Empty a4, legal destination/ })
    .click();
  await expect(
    board.getByRole("gridcell", { name: /White pawn on a4/ }),
  ).toBeVisible();
  await expect(
    board.getByRole("gridcell", { name: /^Black .*last move ended here$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try a similar position" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo my move" }).click();
  await expect(
    board.getByRole("gridcell", { name: /White pawn on a2/ }),
  ).toBeVisible();
  await expect(
    board.getByRole("gridcell", {
      name: /Black king on d8, last move ended here/,
    }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    board.getByRole("gridcell", { name: /Black king on d8/ }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Import completed PGNs" }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    board.getByRole("gridcell", { name: /Black king on d8/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Training plan", exact: true })
    .click();
  await openReviewFromTraining(page);
  await expect(
    board.getByRole("gridcell", { name: /White queen on a5/ }),
  ).toBeVisible();
  await expect(
    board.getByRole("gridcell", { name: /Black queen on d8/ }),
  ).toBeVisible();
});

test("compares the two replies to the queen check and lets White try both", async ({
  page,
}) => {
  const fen = "r1b1kbnr/1pp2ppp/p1p5/8/4q3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 7";
  await openImportedReview(page, fen, "7. Qe2 Qxe2+");
  const board = page.getByRole("grid", { name: "Training board, White side" });
  const rook = page.getByRole("region", { name: "Rook commentary" });
  await expect(rook).toContainText(/Qe2/);
  await expect(rook).toContainText(/Kf1/);
  await expect(rook).toContainText(/castl/i);
  await page.screenshot({ path: test.info().outputPath("check-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await rook.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("check-mobile.png") });
  await board.getByRole("gridcell", { name: /White queen on d1/ }).click();
  await board
    .getByRole("gridcell", { name: /Empty e2, legal destination/ })
    .click();
  await expect(
    board.getByRole("gridcell", { name: /^Black .*last move ended here/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo my move" }).click();
  await expect(
    board.getByRole("gridcell", { name: /Black queen on e4/ }),
  ).toBeVisible();
  await expect(rook).toContainText(/Kf1/);
  await board.getByRole("gridcell", { name: /White king on e1/ }).click();
  await board
    .getByRole("gridcell", { name: /Empty f1, legal destination/ })
    .click();
  await expect(
    board.getByRole("gridcell", { name: /White king on f1/ }),
  ).toBeVisible();
});
