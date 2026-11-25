import { Chess, type Color, type Move, type PieceSymbol } from "chess.js";

type MaterialPiece = Exclude<PieceSymbol, "k">;
const materialValue: Readonly<Record<PieceSymbol, number>> = {
  q: 9,
  r: 5,
  b: 3,
  n: 3,
  p: 1,
  k: 0,
};

export interface BoardCapture {
  readonly by: Color;
  readonly piece: MaterialPiece;
}

export function collectCapture(
  captures: readonly BoardCapture[],
  move: Pick<Move, "color" | "captured">,
): readonly BoardCapture[] {
  return move.captured === undefined || move.captured === "k"
    ? captures
    : [...captures, { by: move.color, piece: move.captured }];
}

export function materialBalance(fen: string): number {
  let difference = 0;
  for (const row of new Chess(fen).board()) {
    for (const piece of row) {
      if (piece !== null)
        difference +=
          (piece.color === "w" ? 1 : -1) * materialValue[piece.type];
    }
  }
  return difference;
}

export type PositionAssessment =
  | { readonly kind: "estimate"; readonly whiteCentipawns: number }
  | { readonly kind: "checkmate"; readonly winner: "white" | "black" }
  | { readonly kind: "draw" };

export function terminalAssessment(position: Chess): PositionAssessment | null {
  if (position.isCheckmate())
    return {
      kind: "checkmate",
      winner: position.turn() === "w" ? "black" : "white",
    };
  return position.isDraw() ? { kind: "draw" } : null;
}
