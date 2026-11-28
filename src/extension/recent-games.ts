import { z } from "zod";

import type { PlayerColor } from "../domain/game/types";
import { DEFAULT_PGN_LIMITS, parsePgnBatch } from "../domain/import/pgn-parser";
import { fetchRecentChessComGames } from "./chess-com-export";
import { isChessComUsername, type GameSite } from "./external-game";

const limit = 20;
const lichessGame = z.object({
  id: z.string().regex(/^[a-z0-9]{8}$/i),
  variant: z.enum(["standard", "fromPosition"]),
  status: z.string(),
  pgn: z.string().min(1).max(DEFAULT_PGN_LIMITS.maxBytes),
  createdAt: z.number().int().nonnegative().optional(),
});
const finishedStatuses = new Set([
  "mate",
  "resign",
  "stalemate",
  "timeout",
  "draw",
  "outoftime",
  "cheat",
  "noStart",
  "variantEnd",
  "unknownFinish",
]);
let lichessRetryAfter = 0;

export function usernameImportSite(hash: string): GameSite | null {
  if (hash === "#import/lichess") return "lichess";
  if (hash === "#import/chess-com") return "chesscom";
  return null;
}

export const usernameImportPaths = {
  lichess: "#import/lichess",
  chesscom: "#import/chess-com",
} as const;

export interface RecentGame {
  readonly id: string;
  readonly pgn: string;
  readonly color: PlayerColor;
  readonly opponent: string;
  readonly date: string | undefined;
  readonly result: "Draw" | "Win" | "Loss";
}

export async function fetchLichessGames(
  username: string,
  signal: AbortSignal,
  page: { readonly max: number; readonly until?: number } = { max: limit },
) {
  const throttled = "Lichess is rate limiting requests. Try again in a minute.";
  if (Date.now() < lichessRetryAfter) throw new Error(throttled);

  const url = new URL("/api/games/user/" + username, "https://lichess.org");
  url.search = new URLSearchParams({
    max: String(page.max),
    ...(page.until !== undefined && { until: String(page.until) }),
    ongoing: "false",
    finished: "true",
    pgnInJson: "true",
    clocks: "false",
    evals: "false",
  }).toString();
  const response = await fetch(url, {
    headers: { Accept: "application/x-ndjson" },
    credentials: "omit",
    cache: "no-cache",
    redirect: "error",
    signal,
  });
  if (response.status === 429) {
    lichessRetryAfter = Date.now() + 60_000;
    throw new Error(throttled);
  }
  if (response.status === 404)
    throw new Error("Lichess couldn’t find that username.");
  if (!response.ok)
    throw new Error("Lichess couldn’t load recent games. Try again.");
  const lines = (await response.text())
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(0, page.max)
    .map((line): unknown => JSON.parse(line));
  const entries = lines.flatMap((raw) => {
    const entry = lichessGame.safeParse(raw);
    return entry.success ? [entry.data] : [];
  });
  return {
    games: entries.filter(({ status }) => finishedStatuses.has(status)),
    // Lichess pages by creation time; the next page starts before this one.
    oldestCreatedAt: Math.min(
      ...entries.flatMap(({ createdAt }) => createdAt ?? []),
    ),
    complete: lines.length < page.max,
  };
}

export async function fetchRecentGames(
  site: GameSite,
  input: string,
  signal: AbortSignal,
): Promise<readonly RecentGame[]> {
  const username = input.trim().toLowerCase();
  const valid =
    site === "chesscom"
      ? isChessComUsername(username)
      : /^[a-z0-9_-]{2,30}$/i.test(username);
  if (!valid)
    throw new Error("Use 2–30 letters, numbers, hyphens or underscores.");
  const request = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  let candidates: readonly { id: string; pgn: string }[];
  try {
    candidates =
      site === "lichess"
        ? (await fetchLichessGames(username, request)).games
        : await fetchRecentChessComGames(username, limit, request);
  } catch (error) {
    if (request.aborted && !signal.aborted)
      throw new Error("Loading games timed out. Try again.", { cause: error });
    if (error instanceof SyntaxError)
      throw new Error("The site returned an unreadable game list. Try again.", {
        cause: error,
      });
    if (error instanceof TypeError)
      throw new Error(
        "Couldn’t reach the site. Check your connection or import a PGN.",
        { cause: error },
      );
    throw error;
  }

  return toRecentGames(username, candidates);
}

// Keeps the games where the username sat on exactly one side.
export function toRecentGames(
  username: string,
  candidates: readonly { readonly id: string; readonly pgn: string }[],
): readonly RecentGame[] {
  return candidates.flatMap(({ id, pgn }) => {
    const batch = parsePgnBatch(pgn);
    const item =
      batch.ok && batch.items.length === 1 ? batch.items[0] : undefined;
    if (item?.status !== "parsed") return [];
    const { headers, result } = item.game;
    const isWhite = headers.White?.toLowerCase() === username;
    const isBlack = headers.Black?.toLowerCase() === username;
    if (isWhite === isBlack) return [];
    const color: PlayerColor = isWhite ? "white" : "black";
    const rawDate = [headers.UTCDate, headers.Date].find(
      (value) =>
        value !== undefined &&
        z.iso.date().safeParse(value.replaceAll(".", "-")).success,
    );
    return [
      {
        id,
        pgn: item.game.originalPgn,
        color,
        opponent:
          (isWhite ? headers.Black : headers.White) ?? "Unknown opponent",
        date: rawDate?.replaceAll(".", "-"),
        result:
          result === "draw"
            ? "Draw"
            : result === color + "-win"
              ? "Win"
              : "Loss",
      },
    ];
  });
}
