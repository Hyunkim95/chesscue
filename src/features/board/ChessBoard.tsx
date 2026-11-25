import { Chess, SQUARES, type Square } from "chess.js";

import type { PlayerColor } from "../../domain/game/types";
import { pieceNames, pieceSymbols } from "./board-pieces";
import "./chess-board.css";

const indices = [0, 1, 2, 3, 4, 5, 6, 7];

export interface ChessBoardProps {
  readonly fen?: string | undefined;
  readonly label: string;
  readonly orientation?: PlayerColor;
  readonly className?: string;
  readonly lastMoveUci?: string | null | undefined;
  readonly highlightedSquare?: string | null;
  readonly selectedSquare?: string | null;
  readonly legalTargets?: readonly string[];
  readonly onSquareSelect?: ((square: Square) => void) | null;
  readonly disabled?: boolean;
}

export function ChessBoard({
  fen,
  label,
  orientation = "white",
  className,
  lastMoveUci,
  highlightedSquare,
  selectedSquare,
  legalTargets = [],
  onSquareSelect,
  disabled = false,
}: ChessBoardProps) {
  let board: ReturnType<Chess["board"]>;
  try {
    board = new Chess(fen).board();
  } catch {
    return <p role="alert">This position could not be displayed.</p>;
  }
  const order = orientation === "white" ? indices : indices.toReversed();
  const lastFrom = lastMoveUci?.slice(0, 2);
  const lastTo = lastMoveUci?.slice(2, 4);
  return (
    <div
      className={
        className === undefined ? "chess-board" : `chess-board ${className}`
      }
    >
      <div className="chess-board__grid" role="grid" aria-label={label}>
        {order.map((row) => (
          <div className="chess-board__row" role="row" key={row}>
            {order.map((column) => {
              const square = SQUARES[row * 8 + column];
              if (square === undefined) return null;
              const piece = board[row]?.[column];
              const dark = (row + column) % 2 === 1;
              const selected = selectedSquare === square;
              const target = legalTargets.includes(square);
              const moved = square === lastFrom || square === lastTo;
              const emphasis =
                selected || moved || highlightedSquare === square;
              const squareClass = `chess-board__square${dark ? " chess-board__square--dark" : ""}${emphasis ? " chess-board__square--highlighted" : ""}${target ? " chess-board__square--target" : ""}`;
              const pieceLabel =
                piece == null
                  ? `Empty ${square}`
                  : `${piece.color === "w" ? "White" : "Black"} ${pieceNames[piece.type]} on ${square}`;
              const movementLabel =
                square === lastFrom
                  ? ", last move started here"
                  : square === lastTo
                    ? ", last move ended here"
                    : "";
              const stateLabel =
                selected && legalTargets.length > 0
                  ? ", selected"
                  : target
                    ? ", legal destination"
                    : "";
              const accessibleLabel = pieceLabel + movementLabel + stateLabel;
              const contents = (
                <>
                  {piece == null ? null : (
                    <span
                      className={`chess-board__piece chess-board__piece--${piece.color === "w" ? "white" : "black"}`}
                      aria-hidden="true"
                    >
                      {pieceSymbols.b[piece.type]}
                    </span>
                  )}
                  <span className="chess-board__coordinate" aria-hidden="true">
                    {square}
                  </span>
                </>
              );
              return onSquareSelect == null ? (
                <div
                  key={square}
                  role="gridcell"
                  className={squareClass}
                  aria-label={accessibleLabel}
                >
                  {contents}
                </div>
              ) : (
                <button
                  key={square}
                  type="button"
                  role="gridcell"
                  className={squareClass}
                  aria-label={accessibleLabel}
                  aria-selected={selected}
                  disabled={disabled}
                  onClick={() => {
                    onSquareSelect(square);
                  }}
                >
                  {contents}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
