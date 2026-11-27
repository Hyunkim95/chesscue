import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import type { MoveAnalysisFact } from "../analysis/types";
import { createGameId, type GameRecord } from "../game/types";
import { observedGameMoves } from "./game-drill";
import { goodMove, goodMovesInGame } from "./good-moves";

// Candidates are Stockfish 19 lite, multiPv 3, at depth 14 or 16, from the
// positions below: [uci, evaluation for the player, line].
type Candidate = readonly [string, number, string];

// A game from `fen` with `sans`, observed at its last move, which is the
// player's.
function observe(
  fen: string,
  sans: readonly string[],
  candidates: readonly Candidate[],
) {
  const chess = new Chess(fen);
  const moves = sans.map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      uci: move.lan,
      san: move.san,
      fenAfter: move.after,
      playedAt: "2026-11-27T10:00:00.000Z",
    };
  });
  const played = moves.at(-1);
  const before = moves.at(-2)?.fenAfter ?? fen;
  const best = candidates[0];
  if (!played || !best) throw Error("Expected a move and a candidate");
  const player = new Chess(before).turn() === "w" ? "white" : "black";
  // A move outside the checked candidates is treated as a clear miss.
  const impact =
    best[1] -
    (candidates.find(([uci]) => uci === played.uci)?.[1] ?? best[1] - 300);
  const game: GameRecord = {
    schemaVersion: 1,
    id: createGameId("good-game"),
    origin: { type: "pgn-paste" },
    playerColor: player,
    result: "white-win",
    initialFen: fen,
    moves,
    pgn: chess.pgn(),
    createdAt: "2026-11-27T10:00:00.000Z",
    completedAt: "2026-11-27T10:30:00.000Z",
    fingerprint: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };
  const fact: MoveAnalysisFact = {
    schemaVersion: 1,
    gameId: game.id,
    ply: played.ply,
    fenBefore: before,
    playedMoveUci: played.uci,
    playedMoveSan: played.san,
    evaluationBeforeCp: best[1],
    evaluationAfterCp: best[1] - impact,
    impactCp: impact,
    phase: "middlegame",
    theme: "other",
    recurrence: 0,
    curricularRelevance: 0,
    analysisVersion: "stockfish-19-lite@1",
    candidates: candidates.map(([uci, evaluationCp, line]) => ({
      uci,
      evaluationCp,
      principalVariation: line.split(" "),
    })),
  };
  const [observed] = observedGameMoves(game, { facts: [fact], moments: [] });
  if (!observed) throw Error("Expected an observed move");
  return observed;
}

const captions = (fen: string, sans: string[], candidates: Candidate[]) =>
  goodMove(observe(fen, sans, candidates))?.frames.map(
    ({ caption }) => caption,
  );

describe("a tactic played", () => {
  // Fried Liver, 11. Nxd5: the knight on c3 takes, then Nb6+ forks the rook.
  it("names what a capture wins once the line settles", () => {
    const found = goodMove(
      observe(
        "r1bq1b1r/ppp3pp/4k3/3np3/2B5/P1N2Q2/1P1P1PPP/n1BK3R w - - 0 11",
        ["Nxd5"],
        [
          [
            "c3d5",
            -68,
            "c3d5 c7c6 d5b6 e6d6 b6a8 d8h4 f3d3 h4d4 d3d4 e5d4 d2d3 c8f5",
          ],
          [
            "c4d5",
            -132,
            "c4d5 e6d7 f3g4 d7d6 g4b4 c7c5 b4c4 d6c7 b2b4 c7b8 b4c5 a1b3",
          ],
          [
            "d2d4",
            -184,
            "d2d4 c7c6 c3d5 c6d5 h1e1 d5c4 e1e5 e6d7 c1g5 d8b6 f3f7 d7c6",
          ],
        ],
      ),
    );
    expect(found).toMatchObject({ kind: "tactic", san: "Nxd5" });
    expect(found?.frames.map(({ caption }) => caption)).toEqual([
      "Move 11, White to move. Watch what you played.",
      "Nxd5 takes my knight.",
      "I answer c6, aiming at d5.",
      "Nb6+ attacks my rook on a8, which nothing defends.",
      "I answer Kd6, covering c5, c6 and e6.",
      "Nxa8 takes my rook.",
      "Nxd5 wins a rook and a knight.",
    ]);
  });

  // The Opera Game, 16. Qb8+: the queen sacrifice before Rd8#.
  it("says a sacrifice starts a forced mate", () => {
    const found = captions(
      "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16",
      ["Qb8+"],
      [
        ["b3b8", 99998, "b3b8 d7b8 d1d8"],
        ["b3b7", 239, "b3b7 f7f6 g5e3 f8e7 b7c8 e7d8 e3a7 e8e7 d1d5"],
        ["d1d7", 0, "d1d7 e8d7 b3b7 d7d6 b7a6 d6c7 a6a7 c7c8 a7a8 c8c7"],
      ],
    );
    expect(found?.at(-1)).toBe("Qb8+ starts a forced mate.");
  });

  it("marks a mate in one without repeating the move's caption", () => {
    // The Opera Game, 17. Rd8#.
    const found = goodMove(
      observe(
        "1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 17",
        ["Rd8#"],
        [
          ["d1d8", 99999, "d1d8"],
          [
            "d1d3",
            -1012,
            "d1d3 f7f6 g5e3 b8c6 d3b3 f8e7 h2h4 e8f7 c1b1 h8b8 b3b8",
          ],
          [
            "c1b1",
            -1013,
            "c1b1 f8e7 g5e7 e8e7 a2a4 h8c8 d1d3 g7g6 d3c3 c8c3 b2c3 b8d7",
          ],
        ],
      ),
    );
    expect(found?.frames.slice(1).map(({ caption }) => caption)).toEqual([
      "Rd8# is checkmate.",
      "Mate in one, and you found it.",
    ]);
    expect(found?.frames.at(-1)?.outlines).toEqual([
      { square: "e8", tone: "coral" },
    ]);
  });

  it("does not credit a quiet move with the tactic that follows it", () => {
    // The Opera Game, 12. O-O-O: best, but the material comes later.
    expect(
      goodMove(
        observe(
          "r3kb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/R3K2R w KQkq - 1 12",
          ["O-O-O"],
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
        ),
      )?.kind,
    ).not.toBe("tactic");
  });

  it("does not count a recapture that completes a trade", () => {
    // The Opera Game, 4...Bxf3 5. Qxf3.
    expect(
      goodMove(
        observe(
          new Chess().fen(),
          ["e4", "e5", "Nf3", "d6", "d4", "Bg4", "dxe5", "Bxf3", "Qxf3"],
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
        ),
      ),
    ).toBeUndefined();
  });
});

describe("a threat dealt with", () => {
  // Scholar's mate threat after 3. Qh5: Black defends f7.
  it("says the move stops a mate threat and draws it", () => {
    const found = goodMove(
      observe(
        "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3",
        ["g6"],
        [
          ["g7g6", 28, "g7g6 h5f3 g8f6 g1e2 f8g7 b1c3 e8g8"],
          ["d8e7", 11, "d8e7 h5d1 g8f6 d2d3 c6a5 b1c3 b7b6 g1f3 c8b7"],
          ["d8f6", -11, "d8f6 b1c3 f8c5 g1f3 g7g6 h5g5 c6d4 g5f6 g8f6"],
        ],
      ),
    );
    expect(found).toMatchObject({ kind: "threat", san: "g6" });
    const [before, , closing] = found?.frames ?? [];
    expect(before).toMatchObject({
      caption: "The queen on h5 threatens mate with Qxf7#.",
      arrows: [{ from: "h5", to: "f7", kind: "threat" }],
    });
    expect(closing?.caption).toBe("g6 stops the mate threat.");
  });

  // Fried Liver, 8...Nb4: the knight on c6 moves to defend the one on d5.
  it("says how the move kept a piece", () => {
    expect(
      captions(
        "r1bq1b1r/ppp3pp/2n1k3/3np3/2B5/2N2Q2/PPPP1PPP/R1B1K2R b KQ - 3 8",
        ["Nb4"],
        [
          [
            "c6b4",
            -101,
            "c6b4 c4b3 c7c6 a2a3 d8f6 f3h5 f6g6 h5g6 h7g6 a3b4 f8b4 c3e4",
          ],
          [
            "c6d4",
            -223,
            "c6d4 c4d5 e6d6 f3d1 c7c6 d5e4 d8h4 e1g1 c8e6 d2d3 d6c7 c1e3",
          ],
          [
            "c6e7",
            -255,
            "c6e7 d2d4 c7c6 d4e5 e6d7 c1g5 d7c7 c4d5 c6d5 c3b5 c7b8 e5e6",
          ],
        ],
      ),
    ).toEqual([
      "The bishop on c4 and the knight on c3 and the queen on f3 can win your knight on d5.",
      "Nb4 attacks my pawn on c2, which nothing defends.",
      "Nb4 defends your knight.",
    ]);
  });

  // Fried Liver, 5. exd5: the only move that saves the bishop on c4.
  it("names the piece when it was the only move that kept it", () => {
    expect(
      captions(
        "r1bqkb1r/ppp2ppp/2n2n2/3pp1N1/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 0 5",
        ["exd5"],
        [
          [
            "e4d5",
            1,
            "e4d5 c6a5 c4b5 c7c6 d5c6 b7c6 b5d3 f6d5 g5f3 f8d6 e1g1 f7f5",
          ],
          [
            "c4b5",
            -191,
            "c4b5 c8g4 f2f3 g4d7 b5c6 d7c6 d2d3 f8c5 g5h3 e8g8 h3f2 h7h6",
          ],
          [
            "c4b3",
            -202,
            "c4b3 f6e4 g5e4 d5e4 e1g1 d8h4 b3d5 c8g4 d5c6 b7c6 d1e1 f7f5",
          ],
        ],
      )?.at(-1),
    ).toBe("exd5 was the only move that keeps your bishop.");
  });

  it("never calls a sacrifice a rescue", () => {
    // Fried Liver, 6. Nxf7: the attacked knight is given up on f7.
    expect(
      goodMove(
        observe(
          "r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6",
          ["Nxf7"],
          [
            [
              "g5f7",
              99,
              "g5f7 e8f7 d1f3 f7e6 b1c3 c6b4 c4b3 c7c6 a2a3 d8f6 f3f6 g7f6",
            ],
            [
              "d2d4",
              69,
              "d2d4 c6d4 c2c3 f7f6 c3d4 f8b4 c1d2 f6g5 d1b3 b4d2 b1d2 c7c6",
            ],
            [
              "d2d3",
              -28,
              "d2d3 f8b4 c2c3 b4e7 e1g1 e8g8 f1e1 c8f5 d1f3 e7g5 f3f5 g5c1",
            ],
          ],
        ),
      )?.kind,
    ).not.toBe("threat");
  });
});

describe("the only move found", () => {
  // The Opera Game, 14. Rd1: every other move gives most of the edge away.
  it("says what the only move keeps", () => {
    expect(
      captions(
        "4kb1r/p2rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2K4R w k - 0 14",
        ["Rd1"],
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
      ),
    ).toEqual([
      "Move 14, White to move. Watch what you played.",
      "Rd1 aims at d7 and adds control of d4, d5 and d3.",
      "Rd1 was the only move that keeps your advantage.",
    ]);
  });

  it("is not counted out of check", () => {
    // Fried Liver, 10. Kd1: the only move, but the knight on c2 gave check.
    expect(
      goodMove(
        observe(
          "r1bq1b1r/ppp3pp/4k3/3np3/2B5/P1N2Q2/1PnP1PPP/R1B1K2R w KQ - 0 10",
          ["Kd1"],
          [
            [
              "e1d1",
              -67,
              "e1d1 c2a1 c3d5 c7c6 d5b6 e6d6 b6a8 d8h4 f3d3 h4d4 d3d4 e5d4",
            ],
            [
              "e1f1",
              -386,
              "e1f1 c7c6 d2d4 c2a1 d4e5 f8e7 g2g3 h8f8 c1f4 a1c2 c4b3 e6d7",
            ],
            [
              "e1e2",
              -644,
              "e1e2 c2d4 e2d1 d4f3 c4d5 e6f6 d5f3 f6f7 d2d4 f8e7 f3e4 e5d4",
            ],
          ],
        ),
      ),
    ).toBeUndefined();
  });

  it("is not claimed when the next move leaves the game standing the same", () => {
    // The Opera Game, 7. Qb3: best by 130, but White stays better either way.
    expect(
      goodMove(
        observe(
          "rn1qkb1r/ppp2ppp/5n2/4p3/2B1P3/5Q2/PPP2PPP/RNB1K2R w KQkq - 2 7",
          ["Qb3"],
          [
            [
              "f3b3",
              237,
              "f3b3 f8c5 c4f7 e8e7 f7d5 b8c6 d5c6 b7c6 b1d2 d8d6 b3g3 h8f8",
            ],
            ["c1e3", 107, "c1e3 b8c6 c2c3 d8d7 h2h3 a8d8 b2b4"],
            ["c1g5", 99, "c1g5 b8c6 c4b5 d8d6 g5f6 d6f6 f3f6 g7f6 b5c6 b7c6"],
          ],
        ),
      ),
    ).toBeUndefined();
  });
});

it("finds nothing in a move Stockfish does not agree with", () => {
  // The Two Knights, 4...h6?: Nxf7 wins material.
  const observed = observe(
    "r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4",
    ["h6"],
    [
      ["d7d5", -10, "d7d5 e4d5 c6a5 c4b5 c7c6 d5c6 b7c6 b5a4"],
      ["f8c5", -113, "f8c5 c4f7 e8e7 f7c4 h8f8 c2c3 h7h6 d2d4"],
      ["f6e4", -129, "f6e4 c4f7 e8e7 d2d4 h7h6 g5e4 e7f7 d4d5"],
    ],
  );
  expect(observed.outcome).toBe("retry");
  expect(goodMovesInGame([observed])).toEqual([]);
});
