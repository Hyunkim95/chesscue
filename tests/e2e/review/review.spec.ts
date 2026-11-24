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
      name: "See the position, then compare the choice",
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("grid", { name: /Review board/ })).toBeVisible();

  await page.getByRole("tab", { name: /^Better move/ }).click();
  await page.getByRole("button", { name: "Play next move" }).click();
  await expect(page.getByRole("status")).toContainText("Comparison step 1");

  await page.getByText("Technical details").click();
  await expect(page.getByText("Analysis version")).toBeVisible();
});
