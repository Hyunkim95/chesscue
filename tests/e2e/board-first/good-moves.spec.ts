import { expect, test, type Page } from "@playwright/test";
import { Chess } from "chess.js";

import { ANALYSIS_VERSION } from "../../../src/app/analysis-version";

// What the player did well (owner decision, 28 November 2026): after a game,
// Rook also finds the player's good moves, says how many under his moments,
// and replays each one on the board. Replaying records nothing. The game is
// the Opera Game with the player as White; every White move carries its real
// Stockfish 19 lite analysis (depth 14, multiPv 3).

const opera = [
  "e4",
  "e5",
  "Nf3",
  "d6",
  "d4",
  "Bg4",
  "dxe5",
  "Bxf3",
  "Qxf3",
  "dxe5",
  "Bc4",
  "Nf6",
  "Qb3",
  "Qe7",
  "Nc3",
  "c6",
  "Bg5",
  "b5",
  "Nxb5",
  "cxb5",
  "Bxb5+",
  "Nbd7",
  "O-O-O",
  "Rd8",
  "Rxd7",
  "Rxd7",
  "Rd1",
  "Qe6",
  "Bxd7+",
  "Nxd7",
  "Qb8+",
  "Nxb8",
  "Rd8#",
];

// [ply, evaluation after the move, [uci, evaluation, line] for each candidate]
type Candidate = readonly [string, number, string];
const analysed: readonly (readonly [number, number, readonly Candidate[]])[] = [
  [
    1,
    32,
    [
      ["e2e4", 39, "e2e4 c7c6 d2d4 d7d5 e4e5 e7e6 b1c3 c6c5 g1f3 c8d7"],
      ["g1f3", 22, "g1f3 d7d5 d2d4 c8f5 c2c4 e7e6 b1c3 b8c6 c1f4 f8b4 e2e3"],
      [
        "d2d4",
        22,
        "d2d4 g8f6 c2c4 e7e6 g1f3 b7b6 b1c3 c8b7 d1d3 f8b4 c1d2 e8g8",
      ],
    ],
  ],
  [
    3,
    27,
    [
      ["g1f3", 31, "g1f3 g8f6 d2d4 e5d4 e4e5 f6e4 d1d4 d7d5 e5d6 e4d6 b1c3"],
      [
        "d2d4",
        16,
        "d2d4 e5d4 d1d4 b8c6 d4a4 g8f6 g1f3 d7d5 f1b5 c8d7 e4d5 d8e7",
      ],
      [
        "b1c3",
        10,
        "b1c3 g8f6 g1f3 b8c6 f1b5 f8d6 b5c4 d6c5 d2d3 e8g8 a2a3 d7d6",
      ],
    ],
  ],
  [
    5,
    54,
    [
      [
        "d2d4",
        52,
        "d2d4 b8d7 f1d3 g7g6 c2c3 g8e7 e1g1 f8g7 h2h3 e8g8 a2a4 g8h8",
      ],
      [
        "f1c4",
        34,
        "f1c4 g8f6 b1c3 f8e7 d2d4 b8d7 d4e5 d6e5 d1e2 c7c6 a2a4 e8g8",
      ],
      ["b1c3", 24, "b1c3 c7c5 f1c4 f8e7 c3d5 g8f6 c2c3 e8g8"],
    ],
  ],
  [
    7,
    103,
    [
      [
        "d4e5",
        108,
        "d4e5 b8c6 e5d6 g8f6 f1b5 d8d6 d1d6 f8d6 b5c6 b7c6 e1g1 e8g8",
      ],
      [
        "c1e3",
        92,
        "c1e3 e5d4 d1d4 b8c6 d4d2 g8f6 b1c3 f8e7 h2h3 g4h5 f3d4 e8g8",
      ],
      [
        "b1c3",
        84,
        "b1c3 e5d4 d1d4 b8c6 d4a4 g8f6 c1e3 g4d7 a4b3 f8e7 e1c1 f6g4",
      ],
    ],
  ],
  [
    9,
    144,
    [
      [
        "d1f3",
        142,
        "d1f3 d6e5 f1c4 d8f6 f3h3 b8d7 b1c3 c7c6 c1e3 f8c5 e1c1 c5e3",
      ],
      [
        "g2f3",
        103,
        "g2f3 b8c6 f1b5 d6e5 d1d8 a8d8 b5c6 b7c6 c1e3 g8e7 e3a7 f7f5",
      ],
      ["d1d5", -263, "d1d5 f3g4 f1c4 g4e6 d5b7 b8d7 c4e6 f7e6 b1c3"],
    ],
  ],
  [
    11,
    152,
    [
      [
        "f3b3",
        131,
        "f3b3 b8d7 f1c4 d8f6 b3b7 a8b8 b7a6 f6a6 c4a6 d7c5 a6d3 c5d3",
      ],
      [
        "f1c4",
        125,
        "f1c4 d8f6 f3h3 b8d7 e1g1 f8c5 a2a4 g8e7 b1c3 a7a6 a4a5 e8c8",
      ],
      [
        "b1c3",
        112,
        "b1c3 b8c6 f1b5 d8f6 f3h3 a7a6 c3d5 f6d6 b5c4 b7b5 c4b3 c6d4",
      ],
    ],
  ],
  [
    13,
    259,
    [
      [
        "f3b3",
        237,
        "f3b3 f8c5 c4f7 e8e7 f7d5 b8c6 d5c6 b7c6 b1d2 d8d6 b3g3 h8f8",
      ],
      ["c1e3", 107, "c1e3 b8c6 c2c3 d8d7 h2h3 a8d8 b2b4"],
      ["c1g5", 99, "c1g5 b8c6 c4b5 d8d6 g5f6 d6f6 f3f6 g7f6 b5c6 b7c6"],
    ],
  ],
  [
    15,
    208,
    [
      ["b3b7", 301, "b3b7 e7b4 b7b4 f8b4 e1e2 e8g8 c1e3 a7a5"],
      [
        "b1c3",
        216,
        "b1c3 c7c6 c1g5 e7c7 g5f6 g7f6 a2a4 b8a6 c4a6 b7a6 b3c4 a8b8",
      ],
      ["e1g1", 157, "e1g1 c7c6 c1e3 f6e4 f1d1 b7b6 b1c3 e4c3 b3c3 b8d7 c4b3"],
    ],
  ],
  [
    17,
    249,
    [
      [
        "c1g5",
        234,
        "c1g5 b7b6 e1c1 b8d7 b3a4 e7c5 g5e3 b6b5 e3c5 b5a4 c5f8 h8f8",
      ],
      [
        "c1e3",
        182,
        "c1e3 b7b5 c3b5 c6b5 c4b5 b8d7 e1c1 e7b4 b3d3 e8c8 e3a7 f8e7",
      ],
      [
        "a2a4",
        170,
        "a2a4 b8a6 c1e3 e7c7 c4a6 b7a6 b3c4 c7b7 e1c1 a8b8 d1d3 f6d7",
      ],
    ],
  ],
  [
    19,
    456,
    [
      ["c3b5", 463, "c3b5 e7b4 b3b4 f8b4 c2c3 e8g8 b5c7"],
      [
        "g5f6",
        178,
        "g5f6 e7f6 c3b5 c6b5 c4b5 b8c6 b3d5 a8c8 e1c1 f6e6 d1d3 a7a6",
      ],
      ["c4e2", 25, "c4e2 b8d7 e1g1 d7c5 b3a3 e7b7 g5f6 g7f6 a3a5"],
    ],
  ],
  [
    21,
    652,
    [
      [
        "c4b5",
        588,
        "c4b5 e8d8 e1c1 d8c7 d1d3 e7b4 b3f7 b4e7 d3c3 c7b6 f7c4 e7b4",
      ],
      ["b3b5", 61, "b3b5 e7d7 g5f6 g7f6 b5d5 b8c6 c4b5 a8c8 e1c1 d7d5 e4d5"],
      [
        "g5f6",
        -188,
        "g5f6 e7b4 b3b4 f8b4 c2c3 b5c4 f6g7 h8g8 g7e5 b4e7 e5g3 b8d7",
      ],
    ],
  ],
  [
    23,
    631,
    [
      [
        "e1c1",
        647,
        "e1c1 a8b8 g5f6 b8b5 b3b5 g7f6 d1d5 a7a6 b5b7 h7h5 h1d1 f8h6",
      ],
      [
        "g5f6",
        390,
        "g5f6 e7b4 b3b4 f8b4 c2c3 b4c3 b2c3 g7f6 e1c1 e8c8 d1d6 d7c5",
      ],
      [
        "a1d1",
        218,
        "a1d1 e7b4 b3b4 f8b4 c2c3 a8b8 b5a4 b4c5 g5f6 g7f6 d1d7 b8b2",
      ],
    ],
  ],
  [
    25,
    738,
    [
      [
        "d1d5",
        548,
        "d1d5 f6d5 g5e7 d5e7 b5d7 e8d7 h1d1 d7c7 d1d8 c7d8 b3b8 e7c8",
      ],
      ["d1d7", 518, "d1d7 d8d7 h1d1 e7c5 g5f6 g7f6 b5d7 e8e7 d7b5 f8h6 c1b1"],
      [
        "d1d3",
        463,
        "d1d3 e7e6 b3e6 f7e6 h1d1 f8e7 g5f6 e7f6 d3d7 d8d7 d1d7 a7a6",
      ],
    ],
  ],
  [
    27,
    734,
    [
      ["h1d1", 686, "h1d1 e7b4 g5f6 g7f6 b5d7 e8d8 b3f7 f8c5"],
      [
        "g5f6",
        190,
        "g5f6 e7f6 h1d1 f8d6 b3h3 f6g5 c1b1 g5e7 c2c4 h7h5 c4c5 e8g8",
      ],
      [
        "b5d7",
        143,
        "b5d7 e7d7 b3b8 d7d8 b8b5 d8d7 b5e5 f8e7 e5b8 e7d8 e4e5 e8g8",
      ],
    ],
  ],
  [
    29,
    347,
    [
      [
        "b5d7",
        1007,
        "b5d7 e6d7 b3b8 e8e7 d1d7 e7d7 b8b7 d7e6 b7c8 e6d6 c8a6 d6d7",
      ],
      [
        "g5f6",
        776,
        "g5f6 g7f6 b5d7 e6d7 b3b8 e8e7 d1d7 e7d7 b8b7 d7d8 b7d5 d8e7",
      ],
      [
        "b3e6",
        553,
        "b3e6 f7e6 g5f6 e8f7 d1d7 f7f6 d7a7 f8c5 a7d7 h8f8 a2a4 g7g5",
      ],
    ],
  ],
  [
    31,
    99999,
    [
      ["b3b8", 99998, "b3b8 d7b8 d1d8"],
      ["b3b7", 239, "b3b7 f7f6 g5e3 f8e7 b7c8 e7d8 e3a7 e8e7 d1d5"],
      ["d1d7", 0, "d1d7 e8d7 b3b7 d7d6 b7a6 d6c7 a6a7 c7c8 a7a8 c8c7"],
    ],
  ],
  [
    33,
    99999,
    [
      ["d1d8", 99999, "d1d8"],
      ["d1d3", -1012, "d1d3 f7f6 g5e3 b8c6 d3b3 f8e7 h2h4 e8f7 c1b1 h8b8 b3b8"],
      [
        "c1b1",
        -1013,
        "c1b1 f8e7 g5e7 e8e7 a2a4 h8c8 d1d3 g7g6 d3c3 c8c3 b2c3 b8d7",
      ],
    ],
  ],
];

const GAME_ID = "11111111-2222-4333-8444-0000000000e1";

function seededGame() {
  const chess = new Chess();
  const fens: string[] = [];
  const moves = opera.map((san, index) => {
    fens.push(chess.fen());
    const move = chess.move(san);
    return {
      ply: index + 1,
      san: move.san,
      uci: move.lan,
      fenAfter: move.after,
      playedAt: new Date(Date.UTC(2026, 10, 27, 10, index)).toISOString(),
    };
  });
  const facts = analysed.map(([ply, after, candidates]) => {
    const played = moves[ply - 1];
    const best = candidates[0];
    if (!played || !best) throw new Error(`No move at ply ${String(ply)}`);
    return {
      schemaVersion: 1,
      gameId: GAME_ID,
      ply,
      fenBefore: fens[ply - 1],
      playedMoveUci: played.uci,
      playedMoveSan: played.san,
      evaluationBeforeCp: best[1],
      evaluationAfterCp: after,
      impactCp: Math.max(0, best[1] - after),
      phase: ply <= 20 ? "opening" : "middlegame",
      theme: "other",
      recurrence: 0,
      curricularRelevance: 0,
      candidates: candidates.map(([uci, evaluationCp, line]) => ({
        uci,
        evaluationCp,
        principalVariation: line.split(" "),
      })),
      analysisVersion: ANALYSIS_VERSION,
    };
  });
  return {
    game: {
      schemaVersion: 1,
      id: GAME_ID,
      origin: { type: "tutor", mode: "coached" },
      initialFen: new Chess().fen(),
      moves,
      pgn: chess.pgn(),
      playerColor: "white",
      result: "white-win",
      createdAt: moves[0]?.playedAt,
      completedAt: moves.at(-1)?.playedAt,
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      fingerprint: null,
    },
    analysis: {
      schemaVersion: 1,
      gameId: GAME_ID,
      analysisVersion: ANALYSIS_VERSION,
      engineBuild: "stockfish-19-lite",
      searchSettings: { timeBudgetPerPositionMs: 1_000, multiPv: 3 },
      facts,
      moments: [],
      analyzedPlayerMoves: facts.length,
      validationStatus: "validated",
      analyzedAt: new Date(Date.UTC(2026, 10, 27, 11)).toISOString(),
    },
    key: JSON.stringify([GAME_ID, ANALYSIS_VERSION]),
  };
}

async function openDatabase(page: Page) {
  await page.goto("/?ui=board-first");
  await expect(page.locator(".today")).toBeVisible({ timeout: 20_000 });
}

async function seed(page: Page) {
  await openDatabase(page);
  await page.evaluate(async ({ game, analysis, key }) => {
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
      tx.objectStore("games").put(game);
      tx.objectStore("analyses").put(analysis, key);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(new Error("The game was not stored"));
      };
    });
    db.close();
  }, seededGame());
  await page.goto(`/?ui=board-first#result/${GAME_ID}`);
  await page.reload();
}

async function storedAttempts(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const request = indexedDB.open("adaptive-chess-tutor");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(new Error("IndexedDB did not open"));
      };
    });
    const count = await new Promise<number>((resolve, reject) => {
      const counted = db
        .transaction("momentAttempts")
        .objectStore("momentAttempts")
        .count();
      counted.onsuccess = () => {
        resolve(counted.result);
      };
      counted.onerror = () => {
        reject(new Error("The attempts were not counted"));
      };
    });
    db.close();
    return count;
  });
}

for (const width of [320, 1280]) {
  test(`the result counts what the player did well and replays it at ${String(width)} px`, async ({
    page,
  }) => {
    const shot = (name: string) =>
      test.info().outputPath(`${name}-${String(width)}.png`);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page);

    await expect(
      page.getByRole("heading", { name: "Rook found 1 moment in this game" }),
    ).toBeVisible({ timeout: 30_000 });
    const row = page.getByRole("button", {
      name: "· and 3 things you did well",
    });
    await expect(row).toBeVisible();
    // The game is over, so the Stockfish bar sits beside the final position.
    await expect(
      page.getByRole("img", { name: "Stockfish: White has won by mate" }),
    ).toBeVisible();
    // Look at it stays the one brass action.
    await expect(page.locator(".ui-button--primary")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Look at it" })).toHaveClass(
      /ui-button--primary/,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({ path: shot("good-moves-result"), fullPage: true });

    await row.click();
    // Three at most, strongest first (owner decision, 28 November 2026):
    // 13. Rxd7 wins material, then the two mating moves. 10. Nxb5, the only
    // move, and the others are left out.
    await expect(
      page.getByRole("grid", { name: "Good move 1 of 3, step 1 of 10" }),
    ).toBeVisible();
    await expect(
      page.getByText("Good move 1 of 3 · Move 13, Rxd7"),
    ).toBeVisible();
    await expect(
      page.getByText("Move 13, White to move. Watch what you played."),
    ).toBeVisible();
    for (let index = 0; index < 9; index++)
      await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByRole("grid", { name: "Good move 1 of 3, step 10 of 10" }),
    ).toBeVisible();
    await expect(page.getByText(/^Rxd7 wins /)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: shot("good-moves-tactic"),
      fullPage: true,
    });

    // ↺ Reset goes back to the position before the move.
    await page.getByRole("button", { name: "↺ Reset" }).click();
    await expect(
      page.getByRole("grid", { name: "Good move 1 of 3, step 1 of 10" }),
    ).toBeVisible();

    // The last good move: 17. Rd8# is mate in one.
    for (let index = 0; index < 2; index++)
      await page.getByRole("button", { name: "Next good move ›" }).click();
    await expect(
      page.getByText("Good move 3 of 3 · Move 17, Rd8#"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Next good move ›" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByText("Mate in one, and you found it."),
    ).toBeVisible();
    await page.screenshot({ path: shot("good-moves-mate"), fullPage: true });

    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("grid", { name: "Final position" }),
    ).toBeVisible();
    await expect(row).toBeVisible();
    // Replaying is read only: no moment attempt was recorded.
    expect(await storedAttempts(page)).toBe(0);
  });
}
