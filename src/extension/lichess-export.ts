import { z } from "zod";
import { DEFAULT_PGN_LIMITS } from "../domain/import/pgn-parser";

const seat = z.object({
  user: z.object({ id: z.string(), name: z.string() }).optional(),
});
const gameExport = z.object({
  id: z.string(),
  status: z.string(),
  variant: z.string(),
  pgn: z.string().max(DEFAULT_PGN_LIMITS.maxBytes),
  players: z.object({ white: seat, black: seat }),
});
const completed = new Set([
  "mate",
  "resign",
  "stalemate",
  "timeout",
  "draw",
  "outoftime",
]);
export type LichessExport = z.infer<typeof gameExport>;

export async function fetchCompletedGame(
  id: string,
  signal: AbortSignal,
): Promise<LichessExport> {
  if (!/^[a-zA-Z0-9]{8}$/.test(id))
    throw new Error("Open a finished Lichess game and try again.");
  const url = new URL("https://lichess.org/game/export/" + id);
  url.search = "pgnInJson=true&clocks=true&evals=true";
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Lichess is rate limiting requests. Try again shortly."
        : "Lichess could not share this game. Check your connection or import its PGN.",
    );
  const raw: unknown = await response.json();
  const game = gameExport.safeParse(raw);
  if (!game.success || game.data.id !== id)
    throw new Error("Lichess returned an unreadable game.");
  if (!completed.has(game.data.status))
    throw new Error(
      "Only finished games can be reviewed. Return after the game ends.",
    );
  if (game.data.variant !== "standard")
    throw new Error("ChessCue supports standard chess games.");
  return game.data;
}
