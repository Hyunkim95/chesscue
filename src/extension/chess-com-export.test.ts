import { afterEach, expect, test, vi } from "vitest";
import { ChessComArchiveMiss, fetchChessComGame } from "./chess-com-export";

const base = "https://api.chess.com/pub/player/mira/games/";
const target = "#chesscom/live/101/mira";
const pgn = '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const game = {
  url: "https://www.chess.com/game/live/101",
  rules: "chess",
  end_time: 1784294200,
  white: { username: "Mira" },
  black: { username: "Sam" },
  pgn,
};

afterEach(() => vi.unstubAllGlobals());

test("only reads the requested player's official archive and matches the selected game", async () => {
  const fetcher = vi.fn<(url: string) => Promise<Response>>();
  fetcher
    .mockResolvedValueOnce(
      Response.json({
        archives: ["https://example.test/2026/08", base + "2026/07"],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ games: [{ ...game, url: game.url + "0" }, game] }),
    );
  vi.stubGlobal("fetch", fetcher);
  const result = await fetchChessComGame(
    target,
    0,
    new AbortController().signal,
  );
  expect(result.id).toBe("101");
  expect(result.pgn).toBe(pgn);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    base + "archives",
    base + "2026/07",
  ]);
});

test("rejects unfinished and nonstandard games", async () => {
  for (const entry of [
    { ...game, end_time: 0 },
    { ...game, pgn: '[Result "*"]\n\n1. f3 *' },
    { ...game, rules: "chess960" },
  ]) {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ archives: [base + "2026/07"] }))
        .mockResolvedValueOnce(Response.json({ games: [entry] })),
    );
    await expect(
      fetchChessComGame(target, 0, new AbortController().signal),
    ).rejects.toThrow("finished standard chess game");
  }
});

test("searches additional archive months only after the first batch is exhausted", async () => {
  const archives = ["2026/04", "2026/05", "2026/06", "2026/07"].map(
    (month) => base + month,
  );
  const fetcher = vi.fn<(url: string) => Promise<Response>>();
  fetcher.mockImplementation((url) =>
    Promise.resolve(
      url.endsWith("archives")
        ? Response.json({ archives })
        : Response.json({ games: url.endsWith("2026/04") ? [game] : [] }),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  await expect(fetchChessComGame(target, 0, signal)).rejects.toBeInstanceOf(
    ChessComArchiveMiss,
  );
  expect(fetcher.mock.calls.map(([url]) => url)).not.toContain(
    base + "2026/04",
  );
  await expect(fetchChessComGame(target, 1, signal)).resolves.toMatchObject({
    id: "101",
  });
});
