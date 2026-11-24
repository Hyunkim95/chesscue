import { describe, expect, it } from "vitest";

import type { MoveAnalysisFact } from "../../domain/analysis/types";
import { selectLearningMoments } from "./select-learning-moments";

function fact(overrides: Partial<MoveAnalysisFact>): MoveAnalysisFact {
  return {
    schemaVersion: 1,
    gameId: "game-1",
    ply: 1,
    fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    playedMoveUci: "e2e4",
    playedMoveSan: "e4",
    evaluationBeforeCp: 20,
    evaluationAfterCp: -80,
    impactCp: 100,
    phase: "opening",
    theme: "development",
    recurrence: 1,
    curricularRelevance: 50,
    candidates: [
      {
        uci: "d2d4",
        san: "d4",
        evaluationCp: 25,
        principalVariation: ["d2d4", "d7d5"],
      },
    ],
    analysisVersion: "analysis-1",
    ...overrides,
  };
}

describe("selectLearningMoments", () => {
  it("selects at most three diverse moments in deterministic priority order", () => {
    const result = selectLearningMoments([
      fact({
        ply: 4,
        impactCp: 300,
        evaluationBeforeCp: 20,
        evaluationAfterCp: -280,
      }),
      fact({
        ply: 5,
        impactCp: 200,
        evaluationBeforeCp: 10,
        evaluationAfterCp: -190,
        theme: "hanging-piece",
        playedMoveUci: "g1f3",
        playedMoveSan: "Nf3",
        candidates: [
          {
            uci: "b1c3",
            san: "Nc3",
            evaluationCp: 15,
            principalVariation: ["b1c3"],
          },
        ],
      }),
      fact({
        ply: 6,
        impactCp: 400,
        evaluationBeforeCp: 0,
        evaluationAfterCp: -400,
        theme: "development",
        playedMoveUci: "b1c3",
        playedMoveSan: "Nc3",
        candidates: [
          {
            uci: "g1f3",
            san: "Nf3",
            evaluationCp: 5,
            principalVariation: ["g1f3"],
          },
        ],
      }),
      fact({
        ply: 7,
        impactCp: 150,
        evaluationBeforeCp: 0,
        evaluationAfterCp: -150,
        theme: "king-safety",
      }),
      fact({
        ply: 8,
        impactCp: 120,
        evaluationBeforeCp: 0,
        evaluationAfterCp: -120,
        theme: "calculation",
      }),
    ]);

    expect(result.moments).toHaveLength(3);
    expect(result.moments.map((moment) => moment.theme)).toEqual([
      "development",
      "hanging-piece",
      "king-safety",
    ]);
  });

  it("rejects illegal or internally inconsistent facts", () => {
    const result = selectLearningMoments([
      fact({ playedMoveUci: "e2e5" }),
      fact({ impactCp: 999 }),
    ]);

    expect(result.moments).toHaveLength(0);
    expect(result.rejectedFacts).toHaveLength(2);
  });

  it("never exceeds the hard maximum when asked for more", () => {
    const result = selectLearningMoments(
      [
        fact({ theme: "development" }),
        fact({ theme: "hanging-piece" }),
        fact({ theme: "king-safety" }),
        fact({ theme: "calculation" }),
      ],
      20,
    );

    expect(result.moments).toHaveLength(3);
  });
});
