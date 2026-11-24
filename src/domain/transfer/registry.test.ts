import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { curatedTransferRegistry, transferExercisesForTheme } from "./registry";
import { validateCuratedTransferExercise } from "./validate";

const expectedThemes = [
  "hanging-piece",
  "one-move-threat",
  "premature-central-exchange",
  "king-safety",
  "development",
] as const;

describe("curated transfer registry", () => {
  it("exports two validated exercises for every prototype theme", () => {
    expect(curatedTransferRegistry).toHaveLength(10);
    for (const theme of expectedThemes) {
      const exercises = transferExercisesForTheme(theme);
      expect(exercises).toHaveLength(2);
      expect(exercises.map(({ difficulty }) => difficulty).sort()).toEqual([
        "close",
        "unlabeled",
      ]);
    }
  });

  it("contains only legal accepted moves with recorded verification", () => {
    for (const exercise of curatedTransferRegistry) {
      expect(validateCuratedTransferExercise(exercise).ok).toBe(true);
      for (const uci of exercise.acceptableMoves) {
        const chess = new Chess(exercise.fen);
        expect(() =>
          chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            ...(uci.length === 5 ? { promotion: uci[4] } : {}),
          }),
        ).not.toThrow();
      }
    }
  });

  it("keeps unlabeled prompts neutral", () => {
    const unlabeled = curatedTransferRegistry.filter(
      ({ difficulty }) => difficulty === "unlabeled",
    );
    expect(unlabeled).toHaveLength(5);
    expect(
      unlabeled.every(({ prompt }) => prompt === "What would you play here?"),
    ).toBe(true);
  });

  it("rejects an unverified acceptable move", () => {
    const source = curatedTransferRegistry[0];
    expect(source).toBeDefined();
    if (source === undefined) return;
    const invalid = {
      ...source,
      acceptableMoves: ["a2a3"],
    };
    expect(validateCuratedTransferExercise(invalid)).toEqual({
      ok: false,
      reason: "An acceptable move lacks Stockfish verification.",
    });
  });
});
