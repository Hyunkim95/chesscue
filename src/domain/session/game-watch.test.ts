import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import type { MoveAnalysisFact } from "../analysis/types";
import { observedGameMoves } from "../curriculum/game-drill";
import { createGameId, type GameRecord } from "../game/types";
import { watchCaption, watchMarkers, watchStop } from "./game-watch";

// Fried Liver, move 11: Stockfish 19 lite, multiPv 3, depth 14.
const FEN = "r1bq1b1r/ppp3pp/4k3/3np3/2B5/P1N2Q2/1P1P1PPP/n1BK3R w - - 0 11";
const CANDIDATES = [
  ["c3d5", -68, "c3d5 c7c6 d5b6 e6d6 b6a8 d8h4 f3d3 h4d4 d3d4 e5d4 d2d3 c8f5"],
  ["c4d5", -132, "c4d5 e6d7 f3g4 d7d6 g4b4 c7c5 b4c4 d6c7 b2b4 c7b8 b4c5 a1b3"],
  ["d2d4", -184, "d2d4 c7c6 c3d5 c6d5 h1e1 d5c4 e1e5 e6d7 c1g5 d8b6 f3f7 d7c6"],
] as const;

// The game from FEN with one move, `san`, observed as the player's.
function observe(san: string) {
  const chess = new Chess(FEN);
  const move = chess.move(san);
  const game: GameRecord = {
    schemaVersion: 1,
    id: createGameId(`watch-${san}`),
    origin: { type: "pgn-paste" },
    playerColor: "white",
    result: "white-win",
    initialFen: FEN,
    moves: [
      {
        ply: 1,
        uci: move.lan,
        san: move.san,
        fenAfter: move.after,
        playedAt: "2026-11-27T10:00:00.000Z",
      },
    ],
    pgn: chess.pgn(),
    createdAt: "2026-11-27T10:00:00.000Z",
    completedAt: "2026-11-27T10:30:00.000Z",
    fingerprint: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };
  const played = CANDIDATES.find(([uci]) => uci === move.lan);
  const impact = CANDIDATES[0][1] - (played?.[1] ?? CANDIDATES[0][1] - 300);
  const fact: MoveAnalysisFact = {
    schemaVersion: 1,
    gameId: game.id,
    ply: 1,
    fenBefore: FEN,
    playedMoveUci: move.lan,
    playedMoveSan: move.san,
    evaluationBeforeCp: CANDIDATES[0][1],
    evaluationAfterCp: CANDIDATES[0][1] - impact,
    impactCp: impact,
    phase: "middlegame",
    theme: "other",
    recurrence: 0,
    curricularRelevance: 0,
    analysisVersion: "stockfish-19-lite@1",
    candidates: CANDIDATES.map(([uci, evaluationCp, line]) => ({
      uci,
      evaluationCp,
      principalVariation: line.split(" "),
    })),
  };
  return observedGameMoves(game, { facts: [fact], moments: [] });
}

describe("watchMarkers", () => {
  it("marks a tactic the player played as a win", () => {
    expect(watchMarkers(observe("Nxd5"), [])).toEqual([
      { ply: 1, kind: "win", san: "Nxd5", moveLabel: "Move 11" },
    ]);
  });

  it("marks a miss only at one of the game's turning points", () => {
    const missed = observe("Bxd5");
    expect(watchMarkers(missed, [{ ply: 1 }])).toEqual([
      { ply: 1, kind: "miss", san: "Bxd5+", moveLabel: "Move 11" },
    ]);
    expect(watchMarkers(missed, [])).toEqual([]);
  });
});

describe("what Rook says while watching", () => {
  it("captions each move and never names a win before it is found", () => {
    expect(
      watchCaption({ san: "e6", byPlayer: false, opponent: "Ahmed" }),
    ).toBe("Ahmed plays e6.");
    expect(
      watchCaption({ san: "Nf3", byPlayer: true, opponent: "Ahmed" }),
    ).toBe("You play Nf3.");
    const win = { ply: 19, kind: "win", san: "Nc7+", moveLabel: "Move 10" };
    expect(
      watchStop({
        marker: { ...win, kind: "win" },
        previousSan: "Qd5",
        opponent: "Ahmed",
      }),
    ).toBe("Ahmed played Qd5. Is there something here?");
    expect(
      watchStop({
        marker: { ...win, kind: "miss", san: "Qb3" },
        previousSan: "Nf4",
        opponent: undefined,
      }),
    ).toBe("You played Qb3. Something stronger was here.");
  });
});
