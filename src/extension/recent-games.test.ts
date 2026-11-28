import { afterEach, expect, test, vi } from "vitest";
import { fetchRecentGames } from "./recent-games";

const pgn = `[Event "Rated blitz"]
[White "Mira"]
[Black "Sam"]
[UTCDate "2026.11.24"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;
const signal = new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

test("Lichess lookup keeps completed games for the matching username", async () => {
  const game = { id: "abc123XY", variant: "standard", status: "mate", pgn };
  const fetcher = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>();
  fetcher.mockResolvedValue(
    new Response(
      [
        { ...game, id: "starts12", status: "started" },
        { ...game, id: "variant1", variant: "atomic" },
        { ...game, id: "nomatch1", pgn: pgn.replace("Sam", "Gina") },
        game,
      ]
        .map((row) => JSON.stringify(row))
        .join("\n"),
    ),
  );
  vi.stubGlobal("fetch", fetcher);

  await expect(fetchRecentGames("lichess", " SAM ", signal)).resolves.toEqual([
    {
      id: game.id,
      pgn,
      color: "black",
      opponent: "Mira",
      date: "2026-11-24",
      result: "Win",
    },
  ]);
  const [url, init] = fetcher.mock.calls[0] ?? [];
  expect(url?.pathname).toBe("/api/games/user/sam");
  expect(url?.searchParams.get("ongoing")).toBe("false");
  expect(init?.credentials).toBe("omit");
});

test("Chess.com lookup orders recent standard games and skips unofficial archive URLs", async () => {
  const base = "https://api.chess.com/pub/player/mira/games/";
  const month = base + "2026/11";
  const game = {
    rules: "chess",
    end_time: 1784294200,
    white: { username: "Mira" },
    black: { username: "Sam" },
    pgn,
  };
  const fetcher = vi.fn<(url: string) => Promise<Response>>();
  fetcher.mockResolvedValueOnce(
    Response.json({ archives: [month, "https://example.test/2026/12"] }),
  );
  fetcher.mockResolvedValueOnce(
    Response.json({
      games: [
        { ...game, url: "https://www.chess.com/game/live/100" },
        {
          ...game,
          url: "https://www.chess.com/game/live/101",
          end_time: game.end_time + 1,
        },
        {
          ...game,
          url: "https://www.chess.com/game/live/102",
          rules: "chess960",
        },
        {
          ...game,
          url: "https://www.chess.com/game/live/103",
          pgn: pgn.replaceAll("0-1", "*"),
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);

  const games = await fetchRecentGames("chesscom", "Mira", signal);
  expect(games.map(({ id, result }) => [id, result])).toEqual([
    ["101", "Loss"],
    ["100", "Loss"],
  ]);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    base + "archives",
    month,
  ]);
});

test("invalid account paths make no request and offline lookup leaves a PGN fallback", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetcher);
  await expect(fetchRecentGames("lichess", "a/b", signal)).rejects.toThrow(
    "Use 2–30",
  );
  expect(fetcher).not.toHaveBeenCalled();
  await expect(fetchRecentGames("chesscom", "mira", signal)).rejects.toThrow(
    "import a PGN",
  );
});
