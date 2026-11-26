import { ChessBoard } from "../board/ChessBoard";

export interface PositionBoardProps {
  readonly fen: string;
  readonly highlightedSquare: string | null;
}

export function PositionBoard({ fen, highlightedSquare }: PositionBoardProps) {
  return (
    <div className="lesson-board-wrap">
      <ChessBoard
        fen={fen}
        label="Lesson position, White side"
        highlightedSquare={highlightedSquare}
      />
      <p className="lesson-board-caption">Verified training position</p>
    </div>
  );
}
