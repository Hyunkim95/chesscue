import { expect, test, type Page } from "@playwright/test";
import { Chess } from "chess.js";

import { ANALYSIS_VERSION } from "../../../src/app/analysis-version";

// A quiet position from the player's own games (owner decision, 27 November
// 2026): Today skips a plan position with several good moves, states the
// goal in terms of the pieces on the board, and explains the answer piece by
// piece. The stored analyses are Stockfish 19 lite at depth 16, multiPv 3.

type Candidate = readonly [uci: string, evaluationCp: number, line: string];

interface SeededMoment {
  readonly ply: number;
  readonly candidates: readonly Candidate[];
  readonly evaluationAfterCp: number;
}

const square = (page: Page, name: string) =>
  page.locator(`[role=gridcell][aria-label^="${name}"]`).first();

// The player has Black against Ahmed.
function seededGame(
  id: string,
  day: number,
  sans: readonly string[],
  moment: SeededMoment,
) {
  const chess = new Chess();
  chess.setHeader("White", "Ahmed");
  chess.setHeader("Black", "You");
  const fens: string[] = [];
  const moves = sans.map((san, index) => {
    fens.push(chess.fen());
    const move = chess.move(san);
    return {
      ply: index + 1,
      san: move.san,
      uci: move.lan,
      fenAfter: move.after,
      playedAt: new Date(Date.UTC(2026, 10, day, 18, index)).toISOString(),
    };
  });
  const played = moves[moment.ply - 1];
  const best = moment.candidates[0];
  if (!played || !best) throw new Error(`No move at ply ${String(moment.ply)}`);
  const fact = {
    schemaVersion: 1,
    gameId: id,
    ply: moment.ply,
    fenBefore: fens[moment.ply - 1],
    playedMoveUci: played.uci,
    playedMoveSan: played.san,
    evaluationBeforeCp: best[1],
    evaluationAfterCp: moment.evaluationAfterCp,
    impactCp: best[1] - moment.evaluationAfterCp,
    phase: "opening",
    theme: "development",
    recurrence: 0,
    curricularRelevance: 50,
    candidates: moment.candidates.map(([uci, evaluationCp, line]) => ({
      uci,
      evaluationCp,
      principalVariation: line.split(" "),
    })),
    analysisVersion: ANALYSIS_VERSION,
  };
  return {
    game: {
      schemaVersion: 1,
      id,
      origin: { type: "pgn-paste" },
      initialFen: new Chess().fen(),
      moves,
      pgn: chess.pgn(),
      playerColor: "black",
      result: "white-win",
      createdAt: moves[0]?.playedAt,
      completedAt: moves.at(-1)?.playedAt,
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      fingerprint: null,
    },
    analysis: {
      schemaVersion: 1,
      gameId: id,
      analysisVersion: ANALYSIS_VERSION,
      engineBuild: "stockfish-19-lite",
      searchSettings: { timeBudgetPerPositionMs: 1_000, multiPv: 3 },
      facts: [fact],
      moments: [],
      analyzedPlayerMoves: 1,
      validationStatus: "validated",
      analyzedAt: new Date(Date.UTC(2026, 10, day, 19)).toISOString(),
    },
    key: JSON.stringify([id, ANALYSIS_VERSION]),
  };
}

// The newest game: 1. e4 f6?! has three moves about as good as each other,
// so it is not served even though it comes first.
const unclear = seededGame(
  "11111111-2222-4333-8444-0000000000b1",
  25,
  ["e4", "f6", "d4", "g5", "Qh5#"],
  {
    ply: 2,
    candidates: [
      ["e7e5", -25, "e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6"],
      ["c7c5", -40, "c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 d8b6 d4f3"],
      ["e7e6", -41, "e7e6 d2d4 d7d5 b1c3 g8f6 e4e5 f6d7 c3e2"],
    ],
    evaluationAfterCp: -139,
  },
);

// An older game: 4...h6? against the Two Knights has one clear answer, 4...d5.
const clear = seededGame(
  "11111111-2222-4333-8444-0000000000b2",
  24,
  ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5", "h6", "Nxf7"],
  {
    ply: 8,
    candidates: [
      ["d7d5", -10, "d7d5 e4d5 c6a5 c4b5 c7c6 d5c6 b7c6 b5a4"],
      ["f8c5", -113, "f8c5 c4f7 e8e7 f7c4 h8f8 c2c3 h7h6 d2d4"],
      ["f6e4", -129, "f6e4 c4f7 e8e7 d2d4 h7h6 g5e4 e7f7 d4d5"],
    ],
    evaluationAfterCp: -619,
  },
);

async function seed(page: Page) {
  await page.goto("/?ui=board-first");
  await expect(page.locator(".today")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(
    async (records) => {
      const request = indexedDB.open("adaptive-chess-tutor");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(new Error("IndexedDB did not open"));
        };
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(["games", "analyses"], "readwrite");
        for (const { game, analysis, key } of records) {
          tx.objectStore("games").put(game);
          tx.objectStore("analyses").put(analysis, key);
        }
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(new Error("The games were not stored"));
        };
      });
      db.close();
    },
    [unclear, clear],
  );
  await page.reload();
}

for (const width of [360, 1280]) {
  test(`a plan position names its pieces and explains the answer on the board at ${String(width)} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await seed(page);

    await expect(page.locator(".today__question")).toHaveText(
      "First, deal with my threat.",
      { timeout: 30_000 },
    );
    await page.screenshot({
      path: `test-results/plan-moment-today-${String(width)}.png`,
    });
    await page.getByRole("button", { name: "Play it" }).click();
    await expect(
      page.getByRole("heading", { name: /Black to move/ }),
    ).toBeVisible({ timeout: 30_000 });
    // Today skipped the newer 1...f6 position for the Two Knights one.
    await expect(square(page, "White knight on g5")).toBeVisible();
    await expect(page.locator(".moment__goal")).toHaveText(
      "First, deal with my threat.",
    );
    // The threat is drawn: both pieces aiming at f7, and f7 outlined.
    await expect(page.locator("[data-move-cue-arrow='g5:f7']")).toHaveCount(1);
    await expect(page.locator("[data-move-cue-arrow='c4:f7']")).toHaveCount(1);
    await expect(square(page, "Black pawn on f7")).toHaveClass(/outline-coral/);
    await page.screenshot({
      path: `test-results/plan-moment-goal-${String(width)}.png`,
    });

    await square(page, "Black pawn on d7").click();
    await square(page, "Empty d5").click();
    await expect(page.getByRole("button", { name: "Done ✓" })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Why does it work?" }).click();
    const bubble = page.locator(".rook-bubble__text");
    await expect(bubble).toHaveText(
      "d5 attacks my bishop on c4, which nothing defends.",
    );
    await expect(page.locator("[data-move-cue-arrow='d5:c4']")).toHaveCount(1);
    // Let the pawn finish sliding before the picture. Rook's idle breathing
    // never ends, so endless animations are left out.
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .every(
          (animation) =>
            animation.playState !== "running" ||
            animation.effect?.getTiming().iterations === Infinity,
        ),
    );
    await page.screenshot({
      path: `test-results/plan-moment-story-${String(width)}.png`,
    });
    await page.getByRole("button", { name: "Next step" }).click();
    await expect(bubble).toHaveText("I take your pawn with exd5.");
  });
}
