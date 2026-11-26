import { Chess } from "chess.js";
import { transferExercisesForTheme } from "../domain/transfer";
import type { LearningTheme } from "../domain/analysis/types";
export function generatedMove(
  theme: LearningTheme,
  mode: "close" | "unlabeled",
  accepted = true,
) {
  const exercise = transferExercisesForTheme(theme).find(
    (e) => e.difficulty === mode,
  );
  if (!exercise) throw Error("Missing generated test exercise: " + theme);
  const board = new Chess(exercise.fen);
  const move = accepted
    ? board.move(exercise.verification.bestMoveUci)
    : board
        .moves({ verbose: true })
        .find(
          (m) =>
            !exercise.acceptableMoves.includes(m.lan) &&
            exercise.verification.candidates.some((c) => c.uci === m.lan),
        );
  if (!move) throw Error("Missing legal alternate move");
  return { exercise, move };
}
export const squareLabel = (square: string) =>
  new RegExp("\\b" + square + "(?:,|$)");
