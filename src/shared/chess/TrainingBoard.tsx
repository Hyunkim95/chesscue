import type { Move, Square } from "chess.js";
import type { BoardCapture } from "../../domain/game/board-balance";
import type { PlayerColor } from "../../domain/game/types";
import { BoardBalance } from "../../features/board/BoardBalance";
import { ChessBoard } from "../../features/board/ChessBoard";
import { pieceNames } from "../../features/board/board-pieces";

export function TrainingBoard({
  fen,
  orientation,
  captures,
  lastMoveUci = null,
  selectedSquare,
  legalMoves,
  promotionSquare = null,
  onSquareSelect,
  onPromote,
  disabled = false,
}: {
  readonly fen: string;
  readonly orientation: PlayerColor;
  readonly captures: readonly BoardCapture[];
  readonly lastMoveUci?: string | null;
  readonly selectedSquare: Square | null;
  readonly legalMoves: readonly Move[];
  readonly promotionSquare?: Square | null;
  readonly onSquareSelect: (square: Square) => void;
  readonly onPromote: (move: Move) => void;
  readonly disabled?: boolean;
}) {
  const promotions =
    promotionSquare === null
      ? []
      : legalMoves.filter(
          (move) => move.to === promotionSquare && move.promotion !== undefined,
        );

  return (
    <>
      <ChessBoard
        fen={fen}
        orientation={orientation}
        className="review-board"
        label={`Training board, ${orientation === "white" ? "White" : "Black"} side`}
        lastMoveUci={lastMoveUci}
        selectedSquare={selectedSquare}
        legalTargets={legalMoves.map((move) => move.to)}
        disabled={disabled}
        onSquareSelect={onSquareSelect}
      />
      {promotions.length > 0 && (
        <div
          className="game-review__feedback-controls"
          role="group"
          aria-label="Promote pawn"
        >
          {promotions.map((move) => (
            <button
              key={move.lan}
              type="button"
              onClick={() => {
                onPromote(move);
              }}
            >
              {pieceNames[move.promotion ?? "q"]}
            </button>
          ))}
        </div>
      )}
      <BoardBalance fen={fen} captures={captures} />
    </>
  );
}
