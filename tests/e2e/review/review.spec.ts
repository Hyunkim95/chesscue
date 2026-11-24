import { expect, test } from "@playwright/test";
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

test("replays and compares a verified learning moment", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Your move", {
    timeout: 10_000,
  });

  const record = buildCompletedTutorGame();
  await page.evaluate(async (game) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("adaptive-chess-tutor", 1);
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

  await page.getByRole("button", { name: "Training plan" }).click();
  await page.getByRole("button", { name: "Analyze latest game" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Find it, play it, transfer it",
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Back to training plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your Training Profile" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "What matters most before you move?" }),
  ).toBeVisible();
  await expect(page.getByText("Technical details")).toHaveCount(0);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Lock this read" }).click();

  await expect(
    page.getByRole("heading", { name: "Commit the move you would play" }),
  ).toBeVisible();
  const board = page.getByRole("grid", { name: /Training board/ });
  await expect(board).toBeVisible();
  const rowHeights = await board
    .locator(".game-review-board__row")
    .evaluateAll((rows) =>
      rows.map((row) => row.getBoundingClientRect().height),
    );
  expect(rowHeights).toHaveLength(8);
  expect(Math.max(...rowHeights) - Math.min(...rowHeights)).toBeLessThan(1);

  await board.getByRole("gridcell", { name: /White pawn on a2/ }).click();
  await board
    .getByRole("gridcell", { name: /Empty a3, legal destination/ })
    .click();
  await page.getByRole("button", { name: "Commit this move" }).click();

  await expect(
    page.getByRole("heading", {
      name: /Your move holds up|Resolve the demand first/,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verified line" }).click();

  await page.getByText("Technical details").click();
  await expect(page.getByText("Analysis version")).toBeVisible();
});
