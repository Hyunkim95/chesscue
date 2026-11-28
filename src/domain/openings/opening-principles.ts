import { Chess, type Color, type Move, type Square } from "chess.js";

import {
  joinedAnd,
  PIECE_NAME,
  undevelopedMinors as minorsAtHome,
} from "../analysis/board-relations";
import { err, ok, type Result } from "../../shared/result/result";

// Rule checks for the opening: development, castling, early queen moves, the
// same piece moving twice and the centre pawns. A main book move is never
// criticised, and a check over several moves is skipped while every one of
// the player's moves so far was a main book move.

export const OPENING_PRINCIPLES_VERSION = "opening-principles/1";

export type OpeningPrincipleKind =
  | "early-queen"
  | "same-piece-twice"
  | "ignored-centre"
  | "undeveloped-minors"
  | "uncastled";

export interface OpeningPrincipleFact {
  readonly kind: OpeningPrincipleKind;
  // The fact describes the position after this ply (1 = White's first move).
  readonly ply: number;
  readonly text: string;
  readonly outlined: readonly Square[];
  readonly arrows: readonly (readonly [Square, Square])[];
}

// The player's tenth move ends the opening, the fifth ends the check on the
// centre pawns, and a queen move up to the sixth counts as early.
const OPENING_MOVES = 10;
const CENTRE_MOVES = 5;
const EARLY_QUEEN_MOVES = 6;

const CENTRE_PAWN_HOMES: Readonly<Record<Color, readonly Square[]>> = {
  w: ["c2", "d2", "e2", "f2"],
  b: ["c7", "d7", "e7", "f7"],
};
const KING_HOME: Readonly<Record<Color, Square>> = { w: "e1", b: "e8" };
const CASTLED_KING: Readonly<Record<Color, { k: Square; q: Square }>> = {
  w: { k: "g1", q: "c1" },
  b: { k: "g8", q: "c8" },
};
function undevelopedMinors(board: Chess, color: Color): Square[] {
  return minorsAtHome(board, color).map(({ square }) => square);
}

function listed(board: Chess, squares: readonly Square[]): string {
  return joinedAnd(
    squares.flatMap((square) => {
      const piece = board.get(square);
      return piece ? [`the ${PIECE_NAME[piece.type]} on ${square}`] : [];
    }),
  );
}

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

export function openingPrinciples(input: {
  readonly moves: readonly string[];
  readonly color: Color;
  // One entry per move: whether it was a main book move.
  readonly theory: readonly boolean[];
}): Result<readonly OpeningPrincipleFact[], "illegal-move"> {
  const { color, theory } = input;
  const them: Color = color === "w" ? "b" : "w";
  const lastPly = (moves: number) => (moves - 1) * 2 + (color === "w" ? 1 : 2);
  const facts: OpeningPrincipleFact[] = [];
  const board = new Chess();
  const timesMoved = new Map<Square, number>();
  let castled = false;
  let allTheory = true;

  for (const [index, uci] of input.moves
    .slice(0, lastPly(OPENING_MOVES))
    .entries()) {
    const ply = index + 1;
    const before = new Chess(board.fen());
    let move: Move;
    try {
      move = board.move(uci);
    } catch {
      return err("illegal-move");
    }
    if (move.color !== color) continue;
    const moveNumber = Math.ceil(ply / 2);
    const count = (timesMoved.get(move.from) ?? 0) + 1;
    timesMoved.delete(move.from);
    timesMoved.set(move.to, count);
    if (move.isKingsideCastle() || move.isQueensideCastle()) castled = true;
    const inTheory = theory[index] === true;
    allTheory &&= inTheory;
    const waiting = undevelopedMinors(board, color);

    // A capture, a check or a retreat from an attack is not a free choice.
    const free =
      !move.isCapture() &&
      !board.inCheck() &&
      before.attackers(move.from, them).length === 0;
    if (!inTheory && free) {
      const developed = 4 - undevelopedMinors(before, color).length;
      if (
        move.piece === "q" &&
        moveNumber <= EARLY_QUEEN_MOVES &&
        developed < 2
      )
        facts.push({
          kind: "early-queen",
          ply,
          text: `${move.san} brings the queen out on move ${String(moveNumber)} with ${developed === 0 ? "no minor pieces" : "one minor piece"} developed.`,
          outlined: [move.to],
          arrows: [[move.from, move.to]],
        });
      if (
        count === 2 &&
        move.piece !== "p" &&
        move.piece !== "k" &&
        waiting.length > 0
      )
        facts.push({
          kind: "same-piece-twice",
          ply,
          text: `${move.san} moves the ${PIECE_NAME[move.piece]} a second time while ${listed(board, waiting)} ${plural(waiting.length, "has", "have")} not moved.`,
          outlined: waiting,
          arrows: [[move.from, move.to]],
        });
    }
    if (allTheory) continue;

    const centrePawns = CENTRE_PAWN_HOMES[color];
    if (
      ply === lastPly(CENTRE_MOVES) &&
      centrePawns.every((square) => {
        const piece = board.get(square);
        return piece?.type === "p" && piece.color === color;
      })
    )
      facts.push({
        kind: "ignored-centre",
        ply,
        text: `After ${String(CENTRE_MOVES)} moves the c-, d-, e- and f-pawns are all still at home, so no pawn claims the centre.`,
        outlined: centrePawns,
        arrows: [],
      });

    if (ply !== lastPly(OPENING_MOVES)) continue;
    if (waiting.length >= 2)
      facts.push({
        kind: "undeveloped-minors",
        ply,
        text: `By move ${String(OPENING_MOVES)}, ${listed(board, waiting)} still sit on their starting squares.`,
        outlined: waiting,
        arrows: [],
      });
    const home = KING_HOME[color];
    const queensOn = board
      .board()
      .flat()
      .some((piece) => piece?.type === "q");
    if (!castled && board.get(home)?.type === "k" && queensOn) {
      const rights = board.getCastlingRights(color);
      const target = rights.k
        ? CASTLED_KING[color].k
        : rights.q
          ? CASTLED_KING[color].q
          : undefined;
      facts.push({
        kind: "uncastled",
        ply,
        text: `By move ${String(OPENING_MOVES)} the king is still on ${home} and has not castled.`,
        outlined: [home],
        arrows: target ? [[home, target]] : [],
      });
    }
  }
  return ok(facts);
}
