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

async function commitFirstLegalMove(page: Page): Promise<void> {
  const board = page.getByRole("grid", { name: /Training board/ });
  const cells = board.getByRole("gridcell");
  const count = await cells.count();
  for (let index = 0; index < count; index += 1) {
    await cells.nth(index).click();
    const targets = board.getByRole("gridcell", { name: /legal destination/ });
    if ((await targets.count()) > 0) {
      await targets.first().click();
      await page.getByRole("button", { name: "Play this move" }).click();
      return;
    }
  }
  throw new Error("No legal board move was available for the training set");
}

test("replays and compares a verified learning moment", async ({ page }) => {
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

  await page.getByRole("button", { name: "Training plan" }).click();
  await page.getByRole("button", { name: "Analyze latest game" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Your game, rewound",
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Back to training plan" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your Training Profile" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Play it differently." }),
  ).toBeVisible();
  await expect(page.getByText(/Set 1 of/i)).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByText("Technical details")).toHaveCount(0);
  const board = page.getByRole("grid", { name: /Training board/ });
  await expect(board).toBeVisible();
  const rowHeights = await board
    .locator(".game-review-board__row")
    .evaluateAll((rows) =>
      rows.map((row) => row.getBoundingClientRect().height),
    );
  expect(rowHeights).toHaveLength(8);
  expect(Math.max(...rowHeights) - Math.min(...rowHeights)).toBeLessThan(1);

  await commitFirstLegalMove(page);

  await expect(
    page.getByRole("heading", { name: /Good move|Try another move/ }),
  ).toBeVisible();
  await expect(page.getByText(/^You played /)).toBeVisible();
  await expect(
    page.getByText("Feedback source: verified local rules"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Undo.*try|Try again/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show coach move" }).click();
  await expect(
    page.getByRole("button", { name: "Back to my move" }),
  ).toBeVisible();
  const opponentReply = page.getByRole("button", {
    name: "Show the opponent's reply",
  });
  if ((await opponentReply.count()) > 0) {
    await opponentReply.click();
    await expect(page.getByText(/opponent's reply/)).toBeVisible();
  }

  await page.getByText("Technical details").click();
  await expect(page.getByText("Analysis version")).toBeVisible();

  const closeAnalogue = page.getByRole("button", {
    name: "Practice this idea",
  });
  if ((await closeAnalogue.count()) > 0) {
    await closeAnalogue.click();
    await expect(
      page.getByText("Optional challenge", { exact: true }),
    ).toBeVisible();
    await commitFirstLegalMove(page);
    const practiceWithoutHint = page.getByRole("button", {
      name: "Practice without a hint",
    });
    if ((await practiceWithoutHint.count()) > 0) {
      await practiceWithoutHint.click();
      await expect(
        page.getByText("No hint this time", { exact: true }),
      ).toBeVisible();
      await commitFirstLegalMove(page);
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
  await expect(page.getByText("Evidence from 1 tutor games.")).toBeVisible();
  await expect(page.getByText(/% mastery/).first()).toBeVisible();
});
