import { z } from "zod";

import { fetchChessComMonth, listArchives } from "./chess-com-export";
import type { GameSite } from "./external-game";
import {
  fetchLichessGames,
  toRecentGames,
  type RecentGame,
} from "./recent-games";

// A player's whole public history comes down one page at a time, newest
// first, so the newest games arrive first and a reload resumes the walk.
export const HISTORY_PAGE_SIZE = 100;
// Guards the device against accounts with tens of thousands of games.
export const HISTORY_GAME_LIMIT = 10_000;

const lichessCursor = z.object({
  site: z.literal("lichess"),
  username: z.string().min(1),
  until: z.number().int().nonnegative().nullable(),
  fetched: z.number().int().nonnegative(),
  done: z.boolean(),
});
const chessComCursor = z.object({
  site: z.literal("chesscom"),
  username: z.string().min(1),
  // Archive months still to read, newest first. Null until listed.
  months: z.array(z.url()).nullable(),
  fetched: z.number().int().nonnegative(),
  done: z.boolean(),
});
export const historyCursor = z.discriminatedUnion("site", [
  lichessCursor,
  chessComCursor,
]);
export type HistoryCursor = z.infer<typeof historyCursor>;

export function startHistory(site: GameSite, username: string): HistoryCursor {
  const name = username.trim().toLowerCase();
  return site === "lichess"
    ? { site, username: name, until: null, fetched: 0, done: false }
    : { site, username: name, months: null, fetched: 0, done: false };
}

export interface SiteHistoryProgress {
  readonly fetched: number;
  readonly status: "fetching" | "waiting" | "offline" | "done" | "failed";
}
export type HistoryProgress = Readonly<
  Partial<Record<GameSite, SiteHistoryProgress | undefined>>
>;

export interface HistoryPage {
  readonly games: readonly RecentGame[];
  readonly next: HistoryCursor;
}

export async function fetchHistoryPage(
  cursor: HistoryCursor,
  signal: AbortSignal,
): Promise<HistoryPage> {
  if (cursor.done) return { games: [], next: cursor };
  if (cursor.site === "lichess") {
    const page = await fetchLichessGames(cursor.username, signal, {
      max: HISTORY_PAGE_SIZE,
      ...(cursor.until !== null && { until: cursor.until }),
    });
    const games = toRecentGames(cursor.username, page.games);
    const fetched = cursor.fetched + games.length;
    const reachedEnd = page.complete || !Number.isFinite(page.oldestCreatedAt);
    return {
      games,
      next: {
        ...cursor,
        until: reachedEnd ? cursor.until : page.oldestCreatedAt - 1,
        fetched,
        done: reachedEnd || fetched >= HISTORY_GAME_LIMIT,
      },
    };
  }
  const months = cursor.months ?? (await listArchives(cursor.username, signal));
  const [month, ...rest] = months;
  if (month === undefined)
    return { games: [], next: { ...cursor, months: [], done: true } };
  const games = toRecentGames(
    cursor.username,
    await fetchChessComMonth(month, signal),
  );
  const fetched = cursor.fetched + games.length;
  return {
    games,
    next: {
      ...cursor,
      months: rest,
      fetched,
      done: rest.length === 0 || fetched >= HISTORY_GAME_LIMIT,
    },
  };
}
