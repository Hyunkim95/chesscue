import { Chess } from "chess.js";

import { opponent, staticExchange } from "./board-relations";
import type { LearningTheme } from "./types";

export interface ThemeClassificationInput {
  readonly fenBefore: string;
  readonly playedMoveUci: string;
  readonly ply: number;
  readonly impactCp: number;
  readonly bestMoveUci?: string;
}

const CENTRAL_SQUARES = new Set(["d4", "e4", "d5", "e5"]);

export function classifyLearningTheme(
  input: ThemeClassificationInput,
): LearningTheme {
  const chess = new Chess(input.fenBefore);
  const move = chess.move({
    from: input.playedMoveUci.slice(0, 2),
    to: input.playedMoveUci.slice(2, 4),
    ...(input.playedMoveUci.length === 5
      ? { promotion: input.playedMoveUci.slice(4, 5) }
      : {}),
  });

  if (
    input.bestMoveUci !== undefined &&
    input.bestMoveUci !== input.playedMoveUci &&
    input.impactCp > 35 &&
    input.ply <= 20 &&
    move.piece === "p" &&
    move.isCapture() &&
    (CENTRAL_SQUARES.has(move.from) || CENTRAL_SQUARES.has(move.to))
  ) {
    return "premature-central-exchange";
  }

  if (
    input.impactCp >= 250 &&
    staticExchange(chess, move.to, opponent(move.color)) > 0
  )
    return "hanging-piece";
  if (input.impactCp >= 150) return "one-move-threat";

  const startingKingSquare = move.color === "w" ? "e1" : "e8";
  const king = chess.get(startingKingSquare);
  if (
    input.ply >= 12 &&
    input.ply <= 30 &&
    king?.type === "k" &&
    king.color === move.color
  ) {
    return "king-safety";
  }
  if (input.ply <= 20) return "development";
  return "calculation";
}
