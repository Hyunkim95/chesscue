import { Chess, type Square } from "chess.js";

// The sixteen central squares, c3 to f6.
export const CENTRE: readonly Square[] = [
  "c3",
  "c4",
  "c5",
  "c6",
  "d3",
  "d4",
  "d5",
  "d6",
  "e3",
  "e4",
  "e5",
  "e6",
  "f3",
  "f4",
  "f5",
  "f6",
];

// The four squares in the middle of the board.
export const CORE_CENTRE: readonly Square[] = ["d4", "e4", "d5", "e5"];

// Core squares first, so a short list names the ones that matter most.
export function byCentrality(squares: readonly Square[]): Square[] {
  return [
    ...squares.filter((square) => CORE_CENTRE.includes(square)),
    ...squares.filter((square) => !CORE_CENTRE.includes(square)),
  ];
}

export interface ControlChange {
  readonly gained: readonly Square[];
  readonly lost: readonly Square[];
}

// Which central squares the mover attacks after a move that it did not before,
// and which it stops attacking. Read from chess.js only.
export function centreControlChange(fen: string, uci: string): ControlChange {
  try {
    const before = new Chess(fen);
    const us = before.turn();
    const after = new Chess(fen);
    after.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    });
    const controls = (board: Chess, square: Square) =>
      board.attackers(square, us).length > 0;
    return {
      gained: CENTRE.filter(
        (square) => controls(after, square) && !controls(before, square),
      ),
      lost: CENTRE.filter(
        (square) => controls(before, square) && !controls(after, square),
      ),
    };
  } catch {
    return { gained: [], lost: [] };
  }
}
