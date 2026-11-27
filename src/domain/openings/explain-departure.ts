import { Chess, type Color, type Square } from "chess.js";

import { joinedAnd, onMinorHome } from "../analysis/board-relations";
import { centreControlChange } from "../analysis/centre-control";
import { isMateScore } from "../analysis/classify-experiment";
import type { OpeningDeparture } from "./opening-book";

// One sentence about where the game left the opening book, comparing the
// played move with the most continued book move. Every reason is read from the
// board: castling, a minor piece leaving its starting square, and centre
// squares the book move newly controls.

const CORE_CENTRE: readonly Square[] = ["d4", "e4", "d5", "e5"];
// Book move and played move within this many centipawns count as equal.
const SAME_CP = 50;

export interface DepartureExplanation {
  readonly text: string;
  readonly bookMove: { readonly uci: string; readonly san: string } | undefined;
  readonly arrows: readonly (readonly [Square, Square])[];
  readonly outlined: readonly Square[];
}

export function explainDeparture(input: {
  readonly departure: OpeningDeparture;
  readonly playerColor: Color;
  // Stockfish scores for the mover after each move, from the mover's side.
  readonly scores?: { readonly bookCp: number; readonly playedCp: number };
}): DepartureExplanation {
  const { departure, playerColor, scores } = input;
  const who = departure.color === playerColor ? "You" : "Your opponent";
  const left = `${who} left the book with ${departure.playedSan}.`;
  const [uci] = departure.bookMoves;
  if (!uci)
    return {
      text: `${who} reached the end of the book line, so ${departure.playedSan} was the first move on ${who === "You" ? "your" : "their"} own.`,
      bookMove: undefined,
      arrows: [],
      outlined: [],
    };

  const board = new Chess(departure.fenBefore);
  const move = board.move(uci);
  const gained = centreControlChange(departure.fenBefore, uci).gained.filter(
    (square) => CORE_CENTRE.includes(square),
  );
  const reasons: string[] = [];
  if (move.isKingsideCastle() || move.isQueensideCastle())
    reasons.push("castles");
  else if (onMinorHome(move.piece, move.color, move.from))
    reasons.push(`develops the ${move.piece === "n" ? "knight" : "bishop"}`);
  if (gained.length) reasons.push(`controls ${joinedAnd(gained)}`);

  const usual =
    `The usual move is ${move.san}` +
    (reasons.length ? `, which ${joinedAnd(reasons)}.` : ".");
  let verdict = "";
  if (scores && !isMateScore(scores.bookCp) && !isMateScore(scores.playedCp)) {
    const gap = scores.bookCp - scores.playedCp;
    verdict =
      gap >= SAME_CP
        ? ` Stockfish rates ${departure.playedSan} ${(gap / 100).toFixed(1)} pawns worse.`
        : ` Stockfish rates the two moves about the same.`;
  }
  return {
    text: `${left} ${usual}${verdict}`,
    bookMove: { uci, san: move.san },
    arrows: [[move.from, move.to]],
    outlined: gained,
  };
}
