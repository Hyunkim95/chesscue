import type { Color, PieceSymbol } from "chess.js";
import { pieceSymbols } from "./board-pieces";
import "./chess-board.css";

export function PromotionPiece({
  piece,
  color,
}: {
  readonly piece: PieceSymbol;
  readonly color: Color;
}) {
  return (
    <span className="promotion-piece" aria-hidden="true">
      {pieceSymbols[color][piece]}
    </span>
  );
}
