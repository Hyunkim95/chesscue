import {
  Chess,
  SQUARES,
  type Color,
  type PieceSymbol,
  type Square,
} from "chess.js";

// Board geometry and piece relations shared by the line-evidence facts and the
// missed-line explanation.

export const PIECE_VALUE: Readonly<Record<PieceSymbol, number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

const ROOK_LINES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
const BISHOP_LINES = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;

export const opponent = (color: Color): Color => (color === "w" ? "b" : "w");
export const fileOf = (square: Square) => square.charCodeAt(0) - 97;
export const rankOf = (square: Square) => square.charCodeAt(1) - 49;

export function squareAt(file: number, rank: number): Square | undefined {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return undefined;
  return SQUARES[(7 - rank) * 8 + file];
}

export function linesFor(type: PieceSymbol) {
  if (type === "r") return ROOK_LINES;
  if (type === "b") return BISHOP_LINES;
  if (type === "q") return [...ROOK_LINES, ...BISHOP_LINES];
  return [];
}

export function piecesOf(board: Chess, color: Color) {
  return board
    .board()
    .flat()
    .flatMap((piece) => (piece?.color === color ? [piece] : []));
}

export function material(board: Chess, color: Color) {
  return piecesOf(board, color)
    .filter(({ type }) => type !== "k")
    .reduce((sum, { type }) => sum + PIECE_VALUE[type], 0);
}

// Whether removing the piece on `square` would expose its own king.
export function pinnedToKing(board: Chess, square: Square, owner: Color) {
  const [king] = board.findPiece({ type: "k", color: owner });
  if (!king || king === square || board.isAttacked(king, opponent(owner)))
    return false;
  const copy = new Chess(board.fen());
  copy.remove(square);
  return copy.isAttacked(king, opponent(owner));
}

// Enemy pieces the piece on `from` attacks.
export function attackedBy(board: Chess, from: Square) {
  const mover = board.get(from);
  if (!mover) return [];
  return piecesOf(board, opponent(mover.color)).filter(({ square }) =>
    board.attackers(square, mover.color).includes(from),
  );
}

// The first two occupied squares along a direction from `from`.
export function lineHits(
  board: Chess,
  from: Square,
  [df, dr]: readonly [number, number],
): Square[] {
  const hits: Square[] = [];
  for (
    let file = fileOf(from) + df, rank = rankOf(from) + dr;
    hits.length < 2;
    file += df, rank += dr
  ) {
    const square = squareAt(file, rank);
    if (!square) break;
    if (board.get(square)) hits.push(square);
  }
  return hits;
}
