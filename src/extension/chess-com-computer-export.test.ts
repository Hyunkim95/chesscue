import { afterEach, expect, test, vi } from "vitest";
import { fetchChessComComputerGame } from "./chess-com-computer-export";

const route = "#chesscom/computer/123/mira/42";
const pgn =
  '[White "Mira"]\n[Black "Sam-BOT"]\n[Result "0-1"]\n[Link "https://www.chess.com/game/computer/123?move=0"]\n\n1. f3 e5 2. g4 Qh4# 0-1';

afterEach(() => vi.unstubAllGlobals());

test("reads the verified completed game from its originating tab for local review", async () => {
  const sendMessage = vi.fn().mockResolvedValue(pgn);
  vi.stubGlobal("chrome", { tabs: { sendMessage } });
  await expect(
    fetchChessComComputerGame(route, new AbortController().signal),
  ).resolves.toEqual({
    id: "123",
    pgn,
    localOnly: true,
    players: {
      white: { user: { id: "Mira", name: "Mira" } },
      black: { user: { id: "Sam-BOT", name: "Sam-BOT" } },
    },
  });
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith(
    42,
    { type: "chesscue:computer-game-pgn", id: "123" },
    { frameId: 0 },
  );
});

test.each([pgn.replace("/123?", "/124?"), pgn.replaceAll("0-1", "*")])(
  "rejects an export for another game or an unfinished result",
  async (exportedPgn) => {
    vi.stubGlobal("chrome", {
      tabs: { sendMessage: vi.fn().mockResolvedValue(exportedPgn) },
    });
    await expect(
      fetchChessComComputerGame(route, new AbortController().signal),
    ).rejects.toThrow();
  },
);
