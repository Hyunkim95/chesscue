import { LoadingState } from "../../shared/loading/LoadingState";
import { useEffect, useState } from "react";
import type { ParsedPgnGame } from "../../domain/import/types";
import { ChessBoard } from "../board/ChessBoard";

export function SharedGameReplay({
  id,
  initialPly,
}: {
  id: string;
  initialPly: number;
}) {
  const [game, setGame] = useState<ParsedPgnGame | "failed" | null>(null);
  const [ply, setPly] = useState(0);
  useEffect(() => {
    let active = true;
    // Firebase loads only for a shared link, never with the app (SLO-014).
    void import("../../infrastructure/firebase/submitted-games")
      .then(({ readSubmittedGame }) => readSubmittedGame(id))
      .then((record) => {
        if (active) {
          setPly(
            Number.isSafeInteger(initialPly)
              ? Math.max(0, Math.min(record.moves.length, initialPly))
              : 0,
          );
          setGame(record);
        }
      })
      .catch(() => {
        if (active) setGame("failed");
      });
    return () => {
      active = false;
    };
  }, [id, initialPly]);
  const move = game && game !== "failed" ? game.moves[ply - 1] : undefined;
  return (
    <main className="content-shell content-shell--narrow shared-game-replay">
      <h1>Shared game</h1>
      {game === null ? (
        <LoadingState shape="board">Loading game…</LoadingState>
      ) : game === "failed" ? (
        <p role="alert">
          This game could not be loaded. Check your connection and reload.
        </p>
      ) : (
        <>
          <h2>
            {game.headers.White ?? "White"} vs {game.headers.Black ?? "Black"}
          </h2>
          <p>Result · {game.headers.Result}</p>
          <ChessBoard
            label="Shared game replay"
            fen={move?.fenAfter ?? game.initialFen}
            lastMoveUci={move?.uci}
          />
          <p aria-live="polite">
            {move
              ? move.san +
                " · " +
                String(ply) +
                " of " +
                String(game.moves.length) +
                " plies"
              : "Starting position"}
          </p>
          <div className="shared-game-replay__moves">
            <button
              type="button"
              aria-label="Previous move"
              title="Previous move"
              className="review-action graphic-control"
              disabled={!ply}
              onClick={() => {
                setPly(ply - 1);
              }}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              aria-label="Next move"
              title="Next move"
              className="review-action graphic-control"
              disabled={ply >= game.moves.length}
              onClick={() => {
                setPly(ply + 1);
              }}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <details>
            <summary>Full PGN</summary>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {game.originalPgn}
            </pre>
          </details>
        </>
      )}
    </main>
  );
}
