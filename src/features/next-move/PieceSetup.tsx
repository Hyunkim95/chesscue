import {
  Chess,
  DEFAULT_POSITION,
  SQUARES,
  type Color,
  type PieceSymbol,
  type Square,
} from "chess.js";
import { useState } from "react";

import { checkFen } from "../../domain/next-move/next-move";
import { ChessBoard } from "../board/ChessBoard";
import { pieceSymbols } from "../board/board-pieces";
import { Button, Pill } from "../../shared/ui/primitives";

// Set up any position by placing pieces. Castling rights the pieces allow
// are kept; checkFen refuses a position Stockfish cannot search.

type Placement = ReadonlyMap<Square, { type: PieceSymbol; color: Color }>;
type Tool = { readonly type: PieceSymbol; readonly color: Color } | "erase";

const TYPES: readonly PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
const NAME: Readonly<Record<PieceSymbol, string>> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};
const EMPTY = "8/8/8/8/8/8/8/8";

function placementOf(fen: string): Placement {
  const map = new Map<Square, { type: PieceSymbol; color: Color }>();
  const board = new Chess(fen, { skipValidation: true });
  for (const square of SQUARES) {
    const piece = board.get(square);
    if (piece) map.set(square, { type: piece.type, color: piece.color });
  }
  return map;
}

function boardOf(placement: Placement): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = "";
    let gap = 0;
    for (const file of "abcdefgh") {
      const square = SQUARES.find((name) => name === `${file}${String(rank)}`);
      const piece = square && placement.get(square);
      if (!piece) {
        gap++;
        continue;
      }
      if (gap > 0) row += String(gap);
      gap = 0;
      row += piece.color === "w" ? piece.type.toUpperCase() : piece.type;
    }
    rows.push(gap > 0 ? row + String(gap) : row);
  }
  return rows.join("/");
}

export function PieceSetup({
  initialFen,
  onCancel,
  onDone,
}: {
  readonly initialFen: string;
  readonly onCancel: () => void;
  readonly onDone: (fen: string) => void;
}) {
  const [placement, setPlacement] = useState<Placement>(() =>
    placementOf(initialFen),
  );
  const [turn, setTurn] = useState<Color>(
    initialFen.split(" ")[1] === "b" ? "b" : "w",
  );
  const [tool, setTool] = useState<Tool>({ type: "p", color: "w" });

  const fen = `${boardOf(placement)} ${turn} KQkq - 0 1`;
  const checked = checkFen(fen);

  function place(square: Square) {
    const next = new Map(placement);
    const here = placement.get(square);
    if (
      tool === "erase" ||
      (here?.type === tool.type && here.color === tool.color)
    )
      next.delete(square);
    else next.set(square, { type: tool.type, color: tool.color });
    setPlacement(next);
  }

  return (
    <div className="next-move next-move--setup">
      <div className="next-move__top">
        <h1 className="next-move__title">Set up pieces</h1>
      </div>
      <div className="next-move__board-column">
        <div
          className="piece-setup__palette"
          role="radiogroup"
          aria-label="Piece to place"
        >
          {(["w", "b"] as const).map((color) =>
            TYPES.map((type) => {
              const active =
                tool !== "erase" && tool.type === type && tool.color === color;
              return (
                <button
                  key={`${color}${type}`}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${color === "w" ? "White" : "Black"} ${NAME[type]}`}
                  className={`piece-setup__piece${active ? " piece-setup__piece--active" : ""}`}
                  onClick={() => {
                    setTool({ type, color });
                  }}
                >
                  <span
                    className={`next-move__glyph next-move__glyph--${color}`}
                    aria-hidden="true"
                  >
                    {pieceSymbols.b[type]}
                  </span>
                </button>
              );
            }),
          )}
        </div>
        <ChessBoard
          className="next-move__board"
          fen={fen}
          label="Setup board"
          setup
          onSquareSelect={place}
        />
        <div className="next-move__controls">
          <Pill
            aria-pressed={tool === "erase"}
            className={tool === "erase" ? "piece-setup__erase--active" : ""}
            onClick={() => {
              setTool("erase");
            }}
          >
            Erase
          </Pill>
          <Pill
            onClick={() => {
              setPlacement(placementOf(`${EMPTY} w - - 0 1`));
            }}
          >
            Clear
          </Pill>
          <Pill
            onClick={() => {
              setPlacement(placementOf(DEFAULT_POSITION));
            }}
          >
            Start
          </Pill>
        </div>
      </div>
      <div className="next-move__panel">
        <div
          className="piece-setup__turn"
          role="radiogroup"
          aria-label="Side to move"
        >
          <span className="piece-setup__turn-label">To move</span>
          {(["w", "b"] as const).map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={turn === color}
              className={`next-move__side next-move__side--${color}${turn === color ? " next-move__side--active" : ""}`}
              onClick={() => {
                setTurn(color);
              }}
            >
              <i aria-hidden="true" />
              {color === "w" ? "White" : "Black"}
            </button>
          ))}
        </div>
        <p className="next-move-sheet__error" aria-live="polite">
          {checked.ok ? "" : checked.error}
        </p>
        <Button
          wide
          disabled={!checked.ok}
          onClick={() => {
            if (checked.ok) onDone(checked.value);
          }}
        >
          Analyse this position
        </Button>
        <Button variant="ghost" wide onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
