import { Chess, type Color, type PieceSymbol } from "chess.js";

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

export interface PositionBoardProps {
  readonly fen: string;
  readonly highlightedSquare: string | null;
}

export function PositionBoard({ fen, highlightedSquare }: PositionBoardProps) {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return <p role="alert">This lesson position could not be displayed.</p>;
  }

  const rows = chess.board();

  return (
    <div className="lesson-board-wrap">
      <div
        className="lesson-board"
        role="grid"
        aria-label="Lesson position, White side"
      >
        {rows.map((row, rowIndex) => (
          <div className="lesson-board-row" role="row" key={String(rowIndex)}>
            {row.map((piece, columnIndex) => {
              const file = String.fromCharCode(97 + columnIndex);
              const rank = String(8 - rowIndex);
              const square = `${file}${rank}`;
              const colorName = piece?.color === "w" ? "White" : "Black";
              const label =
                piece === null
                  ? `Empty ${square}`
                  : `${colorName} ${pieceNames[piece.type]} on ${square}`;
              const light = (rowIndex + columnIndex) % 2 === 0;
              return (
                <div
                  className={`lesson-square ${light ? "lesson-square--light" : "lesson-square--dark"} ${highlightedSquare === square ? "lesson-square--highlighted" : ""}`}
                  role="gridcell"
                  aria-label={label}
                  key={square}
                >
                  {piece === null ? null : (
                    <span className="lesson-piece" aria-hidden="true">
                      {pieceSymbols[piece.color][piece.type]}
                    </span>
                  )}
                  {(file === "a" || rank === "1") && (
                    <span className="lesson-coordinate" aria-hidden="true">
                      {square}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="lesson-board-caption">Verified training position</p>
    </div>
  );
}
