import { ChessBoard } from "../board/ChessBoard";
import { RookCharacter } from "../../shared/rook/RookCharacter";
import "./games-states.css";

export interface ReadingGamesProps {
  // 1-based index of the game being read.
  readonly gameIndex: number;
  readonly total: number;
  readonly opponent: string;
  readonly move: number;
  readonly fen: string;
  readonly momentsFound: number;
}

// "Reading your games": the import-progress state (design §3.7).
export function ReadingGames({
  gameIndex,
  total,
  opponent,
  move,
  fen,
  momentsFound,
}: ReadingGamesProps) {
  const finished = Math.max(0, Math.min(gameIndex - 1, total));
  const share = total > 0 ? finished / total : 0;
  const current = total > 0 && gameIndex <= total ? 1 / total : 0;
  return (
    <div className="games-state games-reading">
      <RookCharacter mood="think" size="lg" />
      <h1 className="games-reading__title">Reading your games…</h1>
      <ChessBoard
        className="games-reading__board"
        fen={fen}
        label={`Your game vs ${opponent}, move ${String(move)}`}
      />
      <div
        className="games-reading__bar"
        role="progressbar"
        aria-label="Games read"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={finished}
        aria-valuetext={`Reading game ${String(gameIndex)} of ${String(total)}`}
      >
        <i
          className="games-reading__done"
          style={{ width: `${String(share * 100)}%` }}
        />
        <i
          className="games-reading__current"
          style={{ width: `${String(current * 100)}%` }}
        />
      </div>
      <p className="games-reading__line">
        Game {String(gameIndex)} of {String(total)} · vs {opponent} · move{" "}
        {String(move)}
      </p>
      {momentsFound > 0 && (
        <p className="games-reading__found" role="status">
          <span aria-hidden="true">✦ </span>
          {String(momentsFound)} {momentsFound === 1 ? "moment" : "moments"}{" "}
          found so far
        </p>
      )}
      <p className="games-reading__note">
        Stockfish checks every move on your device. You can leave; I&apos;ll
        keep going.
      </p>
    </div>
  );
}
