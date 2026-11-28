import { afterEach, expect, test, vi } from "vitest";

import {
  fetchHistoryPage,
  HISTORY_PAGE_SIZE,
  historyCursor,
  startHistory,
} from "./game-history";

afterEach(() => {
  vi.unstubAllGlobals();
});

const pgn = (white: string, black: string, moves: string) =>
  `[White "${white}"]\n[Black "${black}"]\n[Result "0-1"]\n\n${moves} 0-1`;
const lichessLine = (index: number, createdAt: number) =>
  JSON.stringify({
    id: ("g" + String(index).padStart(7, "0")).slice(0, 8),
    variant: "standard",
    status: "resign",
    createdAt,
    pgn: pgn("Mira", "Sam", "1. f3 e5 2. g4 Qh4#"),
  });

test("walks a Lichess history backwards by creation time until a short page", async () => {
  const fetchGames = vi.fn((url: string | URL) => {
    const until = new URL(String(url)).searchParams.get("until");
    const count = until === null ? HISTORY_PAGE_SIZE : 3;
    const start = until === null ? 10_000 : 5_000;
    return Promise.resolve(
      new Response(
        Array.from({ length: count }, (_, index) =>
          lichessLine(index, start - index),
        ).join("\n"),
      ),
    );
  });
  vi.stubGlobal("fetch", fetchGames);
  const signal = new AbortController().signal;

  const first = await fetchHistoryPage(startHistory("lichess", "Sam"), signal);
  expect(first.games).toHaveLength(HISTORY_PAGE_SIZE);
  expect(first.next).toMatchObject({
    until: 10_000 - (HISTORY_PAGE_SIZE - 1) - 1,
    fetched: HISTORY_PAGE_SIZE,
    done: false,
  });
  // A reload restores the cursor from storage.
  const restored = historyCursor.parse(JSON.parse(JSON.stringify(first.next)));

  const second = await fetchHistoryPage(restored, signal);
  expect(second.games).toHaveLength(3);
  expect(second.next).toMatchObject({ fetched: 103, done: true });
  expect(
    new URL(String(fetchGames.mock.calls[1]?.[0])).searchParams.get("until"),
  ).toBe(String(10_000 - HISTORY_PAGE_SIZE));
});

test("reads Chess.com archives one month at a time, newest first", async () => {
  const base = "https://api.chess.com/pub/player/sam/games/";
  const months = [base + "2026/10", base + "2026/11"];
  const fetchGames = vi.fn((url: string | URL) => {
    const target = String(url);
    if (target.endsWith("/archives"))
      return Promise.resolve(Response.json({ archives: months }));
    const month = target.slice(base.length);
    return Promise.resolve(
      Response.json({
        games: [
          {
            url: `https://www.chess.com/game/live/${month === "2026/11" ? "111" : "222"}`,
            end_time: 1,
            rules: "chess",
            pgn: pgn("Mira", "sam", "1. f3 e5 2. g4 Qh4#"),
            white: { username: "Mira" },
            black: { username: "sam" },
          },
        ],
      }),
    );
  });
  vi.stubGlobal("fetch", fetchGames);
  const signal = new AbortController().signal;

  const first = await fetchHistoryPage(startHistory("chesscom", "sam"), signal);
  expect(first.games.map(({ id }) => id)).toEqual(["111"]);
  expect(first.next).toMatchObject({ months: [months[0]], done: false });
  const second = await fetchHistoryPage(first.next, signal);
  expect(second.games.map(({ id }) => id)).toEqual(["222"]);
  expect(second.next).toMatchObject({ months: [], fetched: 2, done: true });
});
