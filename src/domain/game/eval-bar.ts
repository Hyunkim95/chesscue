import { isMateScore } from "../analysis/classify-experiment";
import type { PositionAssessment } from "./board-balance";

// The Stockfish bar beside the board (owner decision, 28 November 2026): how
// much of the bar is White's, and the words a screen reader hears. No number
// is shown. Never used while a game is being played.
export interface BarReading {
  // White's share of the bar, from 0 to 1.
  readonly white: number;
  readonly words: string;
}

export const CHECKING: BarReading = {
  white: 0.5,
  words: "Stockfish is checking",
};

// Lichess's winning-chances curve: a pawn up fills about 59%, a rook up 87%.
const SLOPE = 0.00368208;
// A big but not won advantage never fills the bar.
const EDGE = 0.04;

function side(white: boolean) {
  return white ? "White" : "Black";
}

export function barReading(assessment: PositionAssessment): BarReading {
  if (assessment.kind === "draw") return { white: 0.5, words: "Drawn" };
  if (assessment.kind === "checkmate")
    return {
      white: assessment.winner === "white" ? 1 : 0,
      words: `${side(assessment.winner === "white")} has won by mate`,
    };
  const cp = assessment.whiteCentipawns;
  if (isMateScore(cp))
    return {
      white: cp > 0 ? 1 : 0,
      words: `${side(cp > 0)} has a forced mate`,
    };
  const share = 1 / (1 + Math.exp(-SLOPE * cp));
  const size = Math.abs(cp);
  const words =
    size <= 35
      ? "About even"
      : `${side(cp > 0)} is ${size < 150 ? "a little better" : size < 400 ? "better" : "winning"}`;
  return { white: Math.min(1 - EDGE, Math.max(EDGE, share)), words };
}
