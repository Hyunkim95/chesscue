import { useEffect, useState } from "react";
import { readSubmittedGame } from "../../infrastructure/firebase/submitted-games";
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
    void readSubmittedGame(id)
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
    <main className="content-shell content-shell--narrow">
      <h1>Shared game</h1>
      {game === null ? (
        <p role="status">Loading game…</p>
      ) : game === "failed" ? (
        <p role="alert">
          This game could not be loaded. Check your connection and reload.
        </p>
      ) : (
        <>
          <h2>
            {game.headers.White ?? "White"} vs {game.headers.Black ?? "Black"}
          </h2>
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
          <div className="import-panel__actions">
            <button
              type="button"
              disabled={!ply}
              onClick={() => {
                setPly(ply - 1);
              }}
            >
              Previous move
            </button>
            <button
              type="button"
              disabled={ply >= game.moves.length}
              onClick={() => {
                setPly(ply + 1);
              }}
            >
              Next move
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
