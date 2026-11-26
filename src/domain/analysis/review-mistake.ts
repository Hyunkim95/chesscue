import { Chess } from "chess.js";
import { z } from "zod";

import { buildVariationFrames } from "./replay-game";
import { classifyExperiment } from "./classify-experiment";
import type { PracticeExercise } from "../transfer/types";

const uci = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
const evaluation = z.object({
  line: z.array(uci).min(1).max(3),
  evaluationCpFromSideToMove: z.number().int(),
});

const evidence = z.object({
  fen: z.string(),
  attemptedMove: uci,
  before: evaluation,
  after: evaluation,
});

export type ReviewMistakeEvidence = z.infer<typeof evidence>;

export const reviewMistakeSchema = evidence
  .extend({
    version: z.literal(1),
    id: z.string(),
    gameId: z.string().min(1),
    savedAt: z.iso.datetime(),
    completed: z.boolean(),
  })
  .refine((mistake) => {
    if (
      mistake.id !== reviewMistakeId(mistake.gameId, mistake.fen) ||
      mistake.before.line[0] === mistake.attemptedMove ||
      classifyExperiment(
        mistake.attemptedMove,
        mistake.before,
        mistake.after,
      ) !== "spot" ||
      !buildVariationFrames(mistake.fen, mistake.before.line).ok
    )
      return false;
    try {
      const board = new Chess(mistake.fen);
      const move = board.move(mistake.attemptedMove);
      return (
        move.lan === mistake.attemptedMove &&
        buildVariationFrames(board.fen(), mistake.after.line).ok
      );
    } catch {
      return false;
    }
  });

export type ReviewMistake = z.infer<typeof reviewMistakeSchema>;

export function reviewMistakeId(gameId: string, fen: string): string {
  return (
    "review-mistake-" +
    JSON.stringify([gameId, fen.split(" ").slice(0, 4).join(" ")])
  );
}

export function reviewMistakePractice(mistake: ReviewMistake): {
  readonly moveNumber: number;
  readonly attemptedSan: string;
  readonly exercise: PracticeExercise;
} | null {
  const best = mistake.before.line[0];
  if (!best) return null;
  const board = new Chess(mistake.fen);
  const moveNumber = board.moveNumber();
  const attemptedSan = board.move(mistake.attemptedMove).san;
  return {
    moveNumber,
    attemptedSan,
    exercise: {
      id: mistake.id,
      theme: board.moves().some((san) => san.endsWith("#"))
        ? "one-move-threat"
        : "other",
      fen: mistake.fen,
      acceptableMoves: [best],
      explanation:
        "Review the checked continuation from the position you explored.",
      verification: {
        candidates: [
          {
            uci: best,
            evaluationCp: mistake.before.evaluationCpFromSideToMove,
          },
          {
            uci: mistake.attemptedMove,
            evaluationCp: -mistake.after.evaluationCpFromSideToMove,
          },
        ],
        toleranceCp: 0,
        principalVariation: mistake.before.line,
      },
    },
  };
}
