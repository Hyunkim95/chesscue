import { Chess, SQUARES, type Square } from "chess.js";

// How the pieces get from one position to the next on screen: which piece
// slides from where, and which ones fade in because nothing could have moved
// there (a captured piece coming back on Reset).
export interface PieceMotion {
  // Destination square → origin square.
  readonly slides: ReadonlyMap<Square, Square>;
  readonly appearing: ReadonlySet<Square>;
}

export const NO_MOTION: PieceMotion = {
  slides: new Map(),
  appearing: new Set(),
};

// More changed squares than this is a different position, not a few moves.
const MOST_CHANGED = 8;

function placement(fen: string): Map<Square, string> | undefined {
  try {
    const pieces = new Map<Square, string>();
    new Chess(fen).board().forEach((rank) => {
      rank.forEach((piece) => {
        if (piece) pieces.set(piece.square, piece.color + piece.type);
      });
    });
    return pieces;
  } catch {
    return undefined;
  }
}

function distance(a: Square, b: Square): number {
  const from = SQUARES.indexOf(a);
  const to = SQUARES.indexOf(b);
  return Math.hypot(
    (from % 8) - (to % 8),
    Math.floor(from / 8) - Math.floor(to / 8),
  );
}

export function pieceMotion(before: string, after: string): PieceMotion {
  const was = placement(before);
  const now = placement(after);
  if (!was || !now) return NO_MOTION;
  const left = [...was].filter(([square, piece]) => now.get(square) !== piece);
  const arrived = [...now].filter(
    ([square, piece]) => was.get(square) !== piece,
  );
  if (arrived.length === 0 || arrived.length > MOST_CHANGED) return NO_MOTION;
  const slides = new Map<Square, Square>();
  const appearing = new Set<Square>();
  const free = new Set(left.map(([square]) => square));
  for (const [square, piece] of arrived) {
    // The same piece first; a piece promoted on the last rank comes from a
    // pawn of its colour.
    const pick = (wanted: string) =>
      left
        .filter(([origin, moved]) => free.has(origin) && moved === wanted)
        .map(([origin]) => origin)
        .toSorted((a, b) => distance(a, square) - distance(b, square))[0];
    const color = piece.charAt(0);
    const promoted =
      !piece.endsWith("p") && square.endsWith(color === "w" ? "8" : "1");
    const origin = pick(piece) ?? (promoted ? pick(`${color}p`) : undefined);
    if (origin) {
      free.delete(origin);
      slides.set(square, origin);
    } else appearing.add(square);
  }
  return { slides, appearing };
}
