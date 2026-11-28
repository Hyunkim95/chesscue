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

export const PIECE_NAME: Readonly<Record<PieceSymbol, string>> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

// "a, b and c".
export function joinedAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
}

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

// Where each side's knights and bishops start. A minor piece still on one of
// its own squares has not been developed.
const MINOR_HOMES: Readonly<
  Record<Color, Readonly<Record<"n" | "b", readonly Square[]>>>
> = {
  w: { n: ["b1", "g1"], b: ["c1", "f1"] },
  b: { n: ["b8", "g8"], b: ["c8", "f8"] },
};

export function onMinorHome(
  type: PieceSymbol,
  color: Color,
  square: Square,
): boolean {
  return (
    (type === "n" || type === "b") && MINOR_HOMES[color][type].includes(square)
  );
}

// The knights and bishops of `color` that have not moved yet.
export function undevelopedMinors(board: Chess, color: Color) {
  return piecesOf(board, color).filter(({ type, square }) =>
    onMinorHome(type, color, square),
  );
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

// Static exchange evaluation: what `side` gains, in pawns, by starting the
// captures on `square`. Each side recaptures with its least valuable piece,
// including pieces revealed behind an earlier capturer, and may stop when
// continuing would lose material. A king captures only onto an undefended
// square. Returns 0 when `side` has no capture there.
export function staticExchange(board: Chess, square: Square, side: Color) {
  const target = board.get(square);
  if (!target || target.color === side) return 0;
  const scratch = new Chess(board.fen());
  const gains: number[] = [];
  let victim = PIECE_VALUE[target.type];
  for (let mover = side; ; mover = opponent(mover)) {
    const capturer = scratch
      .attackers(square, mover)
      .flatMap((from) => {
        const piece = scratch.get(from);
        return piece ? [{ from, piece }] : [];
      })
      .sort((a, b) => PIECE_VALUE[a.piece.type] - PIECE_VALUE[b.piece.type])
      .at(0);
    if (!capturer) break;
    if (
      capturer.piece.type === "k" &&
      scratch.attackers(square, opponent(mover)).length > 0
    )
      break;
    gains.push(victim - (gains.at(-1) ?? 0));
    victim = PIECE_VALUE[capturer.piece.type];
    scratch.remove(capturer.from);
    scratch.put(capturer.piece, square);
  }
  for (let depth = gains.length - 1; depth > 0; depth -= 1) {
    gains[depth - 1] = -Math.max(-(gains[depth - 1] ?? 0), gains[depth] ?? 0);
  }
  return gains[0] ?? 0;
}
