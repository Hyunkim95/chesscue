import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { z } from "zod";
import { initializeFirebaseClient } from "../../infrastructure/firebase/firebase-client";
import { digest } from "../../infrastructure/firebase/account-records";
import { parsePgnBatch } from "../../domain/import/pgn-parser";
import type { ParsedPgnGame } from "../../domain/import/types";
import { ChessBoard } from "../board/ChessBoard";

const source = z.object({
  schemaVersion: z.literal(1),
  pgn: z.string().max(1_000_000),
});
async function load(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid source game.");
  const client = initializeFirebaseClient({ enableAppCheck: true });
  if (client.status !== "ready")
    throw new Error("Shared collection unavailable.");
  const data = source.parse(
    (await getDoc(doc(client.services.firestore, "sharedGames", id))).data(),
  );
  if ((await digest(data.pgn)) !== id) throw new Error("Invalid score.");
  const parsed = parsePgnBatch(data.pgn);
  const item = parsed.ok && parsed.items.length === 1 && parsed.items[0];
  if (!item || item.status !== "parsed") throw new Error("Invalid score.");
  return item.game;
}

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
    void load(id)
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
              onClick={() => setPly(ply - 1)}
            >
              Previous move
            </button>
            <button
              type="button"
              disabled={ply >= game.moves.length}
              onClick={() => setPly(ply + 1)}
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
