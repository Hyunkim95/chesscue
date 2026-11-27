import { Chess } from "chess.js";
import { expect, it } from "vitest";

import type { MoveAnalysisFact } from "../analysis/types";
import { createGameId, type GameRecord } from "../game/types";
import { observedGameMoves } from "./game-drill";
import { recommendCurriculumUnit, unitForDrill } from "./recommend-unit";

// Lichess puzzle 0Uxzm from the drill-matching test set: Ng5+ forks the king
// and queen, and the learner played gxf4 instead.
const FEN = "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35";
const FORK_LINE = ["f3g5", "f7f6", "g5e6", "f4g3", "f2g3", "f6e6"];

function missedFork() {
  const chess = new Chess(FEN),
    move = chess.move("gxf4");
  const game: GameRecord = {
    schemaVersion: 1,
    id: createGameId("missed-fork"),
    origin: { type: "pgn-paste" },
    playerColor: "white",
    result: "black-win",
    initialFen: FEN,
    moves: [
      {
        ply: 1,
        uci: move.lan,
        san: move.san,
        fenAfter: move.after,
        playedAt: "2026-11-25T10:00:00Z",
      },
    ],
    pgn: chess.pgn(),
    createdAt: "2026-11-25T10:00:00Z",
    completedAt: "2026-11-25T10:01:00Z",
    fingerprint: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };
  const fact: MoveAnalysisFact = {
    schemaVersion: 1,
    gameId: "missed-fork",
    ply: 1,
    fenBefore: FEN,
    playedMoveUci: move.lan,
    playedMoveSan: move.san,
    evaluationBeforeCp: 723,
    evaluationAfterCp: -60,
    impactCp: 783,
    phase: "endgame",
    theme: "one-move-threat",
    recurrence: 0,
    curricularRelevance: 80,
    analysisVersion: "stockfish-19-lite@1",
    candidates: [
      { uci: "f3g5", evaluationCp: 723, principalVariation: FORK_LINE },
      {
        uci: "g3f4",
        evaluationCp: -60,
        principalVariation: ["g3f4", "f7g8"],
      },
    ],
  };
  const [observed] = observedGameMoves(game, { facts: [fact], moments: [] });
  if (!observed) throw Error("Expected a verified drill");
  return observed;
}

it("recommends the fork unit when the missed line is a fork", () => {
  const observed = missedFork();
  expect(observed.outcome).toBe("retry");
  expect(unitForDrill(observed.drill)).toBe("double-attack");
  expect(recommendCurriculumUnit([observed])?.unitId).toBe("double-attack");
});

it("keeps the played-move theme when the line gives no board evidence", () => {
  const observed = missedFork();
  const drill = {
    ...observed.drill,
    exercise: {
      ...observed.drill.exercise,
      verification: {
        ...observed.drill.exercise.verification,
        principalVariation: [],
      },
    },
  };
  expect(unitForDrill(drill)).toBe("see-the-threat");
});

it("uses a confident board-model unit when the better line is a tactic", () => {
  const { drill } = missedFork();
  const predictedUnit = { probability: 0.9, model: "board-unit-v2" };
  expect(
    unitForDrill({
      ...drill,
      predictedUnit: { ...predictedUnit, unitId: "line-tactics" },
    }),
  ).toBe("line-tactics");
  expect(
    unitForDrill({
      ...drill,
      predictedUnit: {
        ...predictedUnit,
        unitId: "line-tactics",
        probability: 0.5,
      },
    }),
  ).toBe("double-attack");
});

it("ignores the board model when the better line is a quiet defence", () => {
  const { drill } = missedFork();
  const quiet = {
    ...drill,
    exercise: {
      ...drill.exercise,
      verification: {
        ...drill.exercise.verification,
        principalVariation: ["e2d2", "f7g7"],
      },
    },
    predictedUnit: {
      unitId: "line-tactics",
      probability: 0.9,
      model: "board-unit-v2",
    },
  };
  expect(unitForDrill(quiet)).not.toBe("line-tactics");
});
