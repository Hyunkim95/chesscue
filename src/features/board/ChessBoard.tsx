import { Chess, SQUARES, type Square } from "chess.js";
import type { ReactNode } from "react";

import type {
  BoardArrow,
  BoardMoveCue,
} from "../../domain/analysis/board-move-cues";
import type { PlayerColor } from "../../domain/game/types";
import { pieceNames, pieceSymbols } from "./board-pieces";
import "./chess-board.css";

const indices = [0, 1, 2, 3, 4, 5, 6, 7];

export type SquareControlChange = "gained" | "lost";

// A short label pinned to a square, such as "+3" or "✓".
export interface BoardBadge {
  readonly square: Square;
  readonly text: string;
  readonly tone: "coral" | "jade" | "brass";
  readonly label: string;
}

// An outlined piece, such as one of the player's pieces Rook could capture.
export interface BoardOutline {
  readonly square: Square;
  readonly tone: "coral" | "jade";
}

export interface ChessBoardProps {
  // Content laid over the board, such as a transient notice.
  readonly overlay?: ReactNode;
  readonly fen?: string | undefined;
  readonly label: string;
  readonly orientation?: PlayerColor;
  readonly className?: string;
  readonly lastMoveUci?: string | null | undefined;
  readonly animateMove?: boolean;
  readonly highlightedSquare?: string | null;
  readonly focusSquares?: readonly Square[];
  readonly hintSquares?: readonly Square[] | undefined;
  readonly moveCue?: BoardMoveCue | undefined;
  readonly controlChanges?:
    | ReadonlyMap<Square, SquareControlChange>
    | undefined;
  readonly selectedSquare?: string | null;
  readonly controlTarget?: Square | undefined;
  readonly controlMoveLabel?: string;
  readonly legalTargets?: readonly string[];
  readonly onSquareSelect?: ((square: Square) => void) | null;
  readonly disabled?: boolean;
  // Board-first overlays (design §3.2). Extra arrows draw under the move cue.
  readonly extraArrows?: readonly BoardArrow[];
  readonly badges?: readonly BoardBadge[];
  readonly outlines?: readonly BoardOutline[];
  // "Preview · not played" while a what-if move is on the board.
  readonly previewTag?: string | undefined;
  // The square that glows when a position is solved.
  readonly spotSquare?: Square | undefined;
}

function squareCenter(square: Square, orientation: PlayerColor) {
  const index = SQUARES.indexOf(square);
  const x = (index % 8) + 0.5;
  const y = Math.floor(index / 8) + 0.5;
  return orientation === "white" ? { x, y } : { x: 8 - x, y: 8 - y };
}

function BoardArrows({
  arrows,
  orientation,
  inspectingControl,
}: {
  readonly arrows: readonly BoardArrow[];
  readonly orientation: PlayerColor;
  readonly inspectingControl: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="chess-board__control-arrows"
      viewBox="0 0 8 8"
    >
      {arrows.map(({ from, to, kind, offset = 0 }) => {
        const origin = squareCenter(from, orientation);
        const target = squareCenter(to, orientation);
        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const tip = Math.hypot(dx, dy) - 0.328;
        const base = tip - 0.288;
        return (
          <g
            key={`${kind}:${from}:${to}`}
            className={`chess-board__cue-arrow chess-board__cue-arrow--${kind}`}
            data-control-arrow={inspectingControl ? `${from}:${to}` : undefined}
            data-move-cue-arrow={
              inspectingControl ? undefined : `${from}:${to}`
            }
            transform={`translate(${String(origin.x)} ${String(origin.y)}) rotate(${String(angle)}) translate(0 ${String(offset)})`}
          >
            <line
              className="chess-board__cue-shaft"
              x1=".28"
              x2={kind === "move" ? base + 0.08 : base - 0.08}
              y1="0"
              y2="0"
            />
            <polygon
              className="chess-board__cue-tip"
              points={`${String(base)},-.148 ${String(tip)},0 ${String(base)},.148`}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function ChessBoard({
  fen,
  label,
  orientation = "white",
  className,
  lastMoveUci,
  animateMove = false,
  highlightedSquare,
  focusSquares = [],
  hintSquares = [],
  moveCue,
  controlChanges,
  selectedSquare,
  controlTarget,
  controlMoveLabel = "the better move",
  legalTargets = [],
  onSquareSelect,
  disabled = false,
  overlay,
  extraArrows = [],
  badges = [],
  outlines = [],
  previewTag,
  spotSquare,
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
  const animatedOrigin = animateMove
    ? SQUARES.find((square) => square === lastFrom)
    : undefined;
  const arrows: readonly BoardArrow[] = [
    ...extraArrows,
    ...(controlTarget
      ? focusSquares.map(
          (from): BoardArrow => ({ from, to: controlTarget, kind: "control" }),
        )
      : (moveCue?.arrows ?? [])),
  ];
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
              const slide =
                animatedOrigin && square === lastTo
                  ? {
                      from: squareCenter(animatedOrigin, orientation),
                      to: squareCenter(square, orientation),
                    }
                  : undefined;
              const dark = (row + column) % 2 === 1;
              const selected = selectedSquare === square;
              const target = legalTargets.includes(square);
              const moved = square === lastFrom || square === lastTo;
              const emphasis =
                (selected && !controlChanges) ||
                moved ||
                highlightedSquare === square;
              const focus = focusSquares.includes(square);
              const hint = hintSquares.includes(square);
              const controlChange = controlChanges?.get(square);
              const inspecting = square === controlTarget;
              const cue = moveCue?.squares?.find(
                (item) => item.square === square,
              );
              const badge = badges.find((item) => item.square === square);
              const outline = outlines.find((item) => item.square === square);
              const ghost =
                moveCue?.ghost?.from === square ? moveCue.ghost : undefined;
              const cueDescription =
                badge?.label ??
                cue?.label ??
                (ghost ? `Former defender on ${square}.` : undefined);
              const squareClass = `chess-board__square${dark ? " chess-board__square--dark" : ""}${emphasis ? " chess-board__square--highlighted" : ""}${target ? " chess-board__square--target" : ""}${focus ? " chess-board__square--focus" : ""}${controlChange ? ` chess-board__square--control-${controlChange}` : ""}${inspecting ? " chess-board__square--control-inspected" : ""}${outline ? ` chess-board__square--outline-${outline.tone}` : ""}${spotSquare === square ? " chess-board__square--spot" : ""}`;
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
              const accessibleLabel =
                pieceLabel +
                movementLabel +
                stateLabel +
                (focus
                  ? controlTarget
                    ? `, controls ${controlTarget}`
                    : ", Rook highlight"
                  : "") +
                (hint ? ", Rook hint" : "") +
                (controlChange
                  ? `, control ${controlChange} by ${controlMoveLabel}`
                  : "");
              const contents = (
                <>
                  {piece == null ? null : (
                    <span
                      className={`chess-board__piece chess-board__piece--${piece.color === "w" ? "white" : "black"}${slide ? " chess-board__piece--sliding" : ""}`}
                      style={
                        slide
                          ? {
                              translate: `${String((slide.from.x - slide.to.x) * 12.5)}cqw ${String((slide.from.y - slide.to.y) * 12.5)}cqw`,
                            }
                          : undefined
                      }
                      aria-hidden="true"
                    >
                      {pieceSymbols.b[piece.type]}
                    </span>
                  )}
                  {ghost && piece == null && (
                    <span
                      className={`chess-board__piece chess-board__piece--ghost${ghost.color === "w" ? " chess-board__piece--white" : ""}`}
                      aria-hidden="true"
                    >
                      {pieceSymbols.b[ghost.piece]}
                    </span>
                  )}
                  {hint && (
                    <span
                      className="chess-board__hint-mark"
                      aria-hidden="true"
                    />
                  )}
                  {cue && (
                    <span className="chess-board__cue-mark" aria-hidden="true">
                      {cue.glyph}
                    </span>
                  )}
                  {badge && (
                    <span
                      className={`chess-board__badge chess-board__badge--${badge.tone}`}
                      aria-hidden="true"
                    >
                      {badge.text}
                    </span>
                  )}
                  <span className="chess-board__coordinate" aria-hidden="true">
                    {square}
                  </span>
                  {column === order[0] && (
                    <span
                      className="chess-board__edge-coordinate chess-board__edge-coordinate--rank"
                      aria-hidden="true"
                    >
                      {square[1]}
                    </span>
                  )}
                  {row === order.at(-1) && (
                    <span
                      className="chess-board__edge-coordinate chess-board__edge-coordinate--file"
                      aria-hidden="true"
                    >
                      {square[0]}
                    </span>
                  )}
                  {controlChange && (
                    <span
                      className="chess-board__control-mark"
                      aria-hidden="true"
                    >
                      {controlChange === "gained" ? "+" : "−"}
                    </span>
                  )}
                </>
              );
              return onSquareSelect == null ? (
                <div
                  key={square}
                  role="gridcell"
                  className={squareClass}
                  aria-label={accessibleLabel}
                  aria-description={cueDescription}
                  data-board-cue={cue?.glyph}
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
                  aria-description={cueDescription}
                  data-board-cue={cue?.glyph}
                  aria-selected={selected}
                  disabled={
                    disabled ||
                    (controlChanges !== undefined &&
                      controlChange === undefined)
                  }
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
        {arrows.length > 0 && (
          <BoardArrows
            arrows={arrows}
            orientation={orientation}
            inspectingControl={controlTarget !== undefined}
          />
        )}
        {previewTag && (
          <span className="chess-board__preview-tag" role="status">
            {previewTag}
          </span>
        )}
      </div>
      {overlay}
    </div>
  );
}
