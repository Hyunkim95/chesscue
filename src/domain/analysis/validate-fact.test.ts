import { describe, expect, it } from "vitest";

import { validateMoveAnalysisFact } from "./validate-fact";

const improvedMoveFact = {
  schemaVersion: 1,
  gameId: "game-1",
  ply: 1,
  fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  playedMoveUci: "e2e4",
  playedMoveSan: "e4",
  evaluationBeforeCp: 20,
  evaluationAfterCp: 40,
  impactCp: 0,
  phase: "opening",
  theme: "development",
  recurrence: 0,
  curricularRelevance: 0,
  candidates: [
    {
      uci: "e2e4",
      san: "e4",
      evaluationCp: 20,
      principalVariation: ["e2e4", "e7e5"],
    },
  ],
  analysisVersion: "analysis-1",
} as const;

describe("validateMoveAnalysisFact", () => {
  it("treats an improved evaluation as zero negative impact", () => {
    expect(validateMoveAnalysisFact(improvedMoveFact)).toMatchObject({
      ok: true,
      fact: { impactCp: 0 },
    });
  });
});
