import { starterPack } from "../material/pack";
import { reflectionSchema } from "../material/reflection";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import {
  generatedTransferRegistry,
  transferExercisesForTheme,
} from "./registry";
import { validateGeneratedTransferExercise } from "./validate";

const expectedThemes = [
  "hanging-piece",
  "one-move-threat",
  "premature-central-exchange",
  "king-safety",
  "development",
] as const;

describe("curated transfer registry", () => {
  it("exports only derived exercises with source and generation evidence", () => {
    expect(generatedTransferRegistry.length).toBeGreaterThan(1);
    for (const theme of expectedThemes) {
      const exercises = transferExercisesForTheme(theme);
      expect(exercises.length).toBeGreaterThan(0);
      for (const e of exercises) {
        expect(e.source.sourceHash).toMatch(/^[a-f0-9]{64}$/);
        expect(e.authorship.runId).toBe(starterPack.runId);
      }
    }
  });

  it("contains only legal accepted moves with recorded verification", () => {
    for (const exercise of generatedTransferRegistry) {
      expect(validateGeneratedTransferExercise(exercise).ok).toBe(true);
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
      expect(exercise.verification.principalVariation[0]).toBe(
        exercise.verification.bestMoveUci,
      );
    }
  });

  it("keeps unlabeled prompts neutral", () => {
    const unlabeled = generatedTransferRegistry.filter(
      ({ difficulty }) => difficulty === "unlabeled",
    );
    expect(unlabeled.length).toBeGreaterThan(0);
    expect(
      unlabeled.every(
        ({ prompt }) =>
          reflectionSchema.safeParse(prompt).success &&
          !/mate|fork|castle/i.test(prompt),
      ),
    ).toBe(true);
  });

  it("rejects an unverified acceptable move", () => {
    const source = generatedTransferRegistry[0];
    expect(source).toBeDefined();
    if (source === undefined) return;
    const invalid = {
      ...source,
      acceptableMoves: ["a2a3"],
    };
    expect(validateGeneratedTransferExercise(invalid)).toEqual({
      ok: false,
      reason: "An acceptable move lacks Stockfish verification.",
    });
  });

  it("rejects an illegal or mismatched principal variation", () => {
    const source = generatedTransferRegistry[0];
    expect(source).toBeDefined();
    if (source === undefined) return;
    const invalid = {
      ...source,
      verification: {
        ...source.verification,
        principalVariation: ["a2a3"],
      },
    };
    expect(validateGeneratedTransferExercise(invalid)).toEqual({
      ok: false,
      reason:
        "Verified principal variation must be legal and start with the best move.",
    });
  });
});
