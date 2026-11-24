import { Chess, type Color, type PieceSymbol } from "chess.js";

import type { PlayerColor } from "../../domain/game/types";

const pieceNames: Readonly<Record<PieceSymbol, string>> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const pieceSymbols: Readonly<
  Record<Color, Readonly<Record<PieceSymbol, string>>>
> = {
  w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
  b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" },
};

const FORWARD = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const REVERSE = [7, 6, 5, 4, 3, 2, 1, 0] as const;

export interface ReviewBoardProps {
  readonly fen: string;
  readonly orientation: PlayerColor;
  readonly lastMoveUci: string | null;
}

export function ReviewBoard({
  fen,
  orientation,
  lastMoveUci,
}: ReviewBoardProps) {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return <p role="alert">This review position could not be displayed.</p>;
  }

  const board = chess.board();
  const rowOrder = orientation === "white" ? FORWARD : REVERSE;
  const columnOrder = orientation === "white" ? FORWARD : REVERSE;
  const lastFrom = lastMoveUci?.slice(0, 2) ?? null;
  const lastTo = lastMoveUci?.slice(2, 4) ?? null;

  return (
    <div className="game-review-board-wrap">
      <div
        className="game-review-board"
        role="grid"
        aria-label={`Review board, ${orientation === "white" ? "White" : "Black"} side`}
      >
        {rowOrder.map((rowIndex) => (
          <div
            className="game-review-board__row"
            role="row"
            key={String(rowIndex)}
          >
            {columnOrder.map((columnIndex) => {
              const piece = board[rowIndex]?.[columnIndex] ?? null;
              const file = String.fromCharCode(97 + columnIndex);
              const rank = String(8 - rowIndex);
              const square = `${file}${rank}`;
              const lastMoveRole =
                square === lastFrom
                  ? ", last move started here"
                  : square === lastTo
                    ? ", last move ended here"
                    : "";
              const label =
                piece === null
                  ? `Empty ${square}${lastMoveRole}`
                  : `${piece.color === "w" ? "White" : "Black"} ${pieceNames[piece.type]} on ${square}${lastMoveRole}`;
              const light = (rowIndex + columnIndex) % 2 === 0;
              const lastMove = square === lastFrom || square === lastTo;
              return (
                <div
                  className={`game-review-square ${light ? "game-review-square--light" : "game-review-square--dark"} ${lastMove ? "game-review-square--last" : ""}`}
                  role="gridcell"
                  aria-label={label}
                  key={square}
                >
                  {piece === null ? null : (
                    <span className="game-review-piece" aria-hidden="true">
                      {pieceSymbols[piece.color][piece.type]}
                    </span>
                  )}
                  <span className="game-review-coordinate" aria-hidden="true">
                    {square}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
