import type { PlayerColor } from "../../domain/game/types";
import { ChessBoard, type ChessBoardProps } from "../board/ChessBoard";

export type ReviewBoardProps = Omit<
  ChessBoardProps,
  "label" | "orientation" | "className" | "fen" | "lastMoveUci"
> & {
  readonly fen: string;
  readonly orientation: PlayerColor;
  readonly lastMoveUci: string | null;
};

export function ReviewBoard({
  orientation,
  onSquareSelect = null,
  ...props
}: ReviewBoardProps) {
  return (
    <ChessBoard
      {...props}
      className="review-board"
      label={`${onSquareSelect === null ? "Review" : "Training"} board, ${orientation === "white" ? "White" : "Black"} side`}
      orientation={orientation}
      onSquareSelect={onSquareSelect}
    />
  );
}
