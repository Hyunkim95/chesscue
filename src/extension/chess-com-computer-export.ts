import { DEFAULT_PGN_LIMITS, parsePgnBatch } from "../domain/import/pgn-parser";
import type { CompletedGameExport } from "./external-game";

export async function fetchChessComComputerGame(
  route: string,
  signal: AbortSignal,
): Promise<CompletedGameExport> {
  const [, id, tab] =
    /^#chesscom\/computer\/(\d{1,18})\/[a-z0-9_-]{2,30}\/(\d{1,10})$/i.exec(
      route,
    ) ?? [];
  if (!id || !tab)
    throw new Error("Open a finished Chess.com bot game and try again.");
  const unavailable =
    "Open the finished bot game in the original tab, then try again.";
  const pgn: unknown = await chrome.tabs
    .sendMessage(
      Number(tab),
      {
        type: "chesscue:computer-game-pgn",
        id,
      },
      { frameId: 0 },
    )
    .catch(() => null);
  signal.throwIfAborted();
  if (typeof pgn !== "string") throw new Error(unavailable);

  const batch = parsePgnBatch(pgn, { ...DEFAULT_PGN_LIMITS, maxGames: 1 });
  const entry = batch.ok ? batch.items[0] : undefined;
  if (entry?.status !== "parsed")
    throw new Error(
      "ChessCue needs a finished standard chess game with a readable PGN.",
    );
  const headers = entry.game.headers;
  const linkedId =
    /^https:\/\/www\.chess\.com\/game\/computer\/(\d{1,18})\/?(?:[?#]|$)/.exec(
      headers.Link ?? "",
    )?.[1];
  if (linkedId !== id)
    throw new Error("ChessCue couldn’t match the PGN to this bot game.");

  return {
    id,
    pgn,
    localOnly: true,
    players: {
      white: {
        user: headers.White
          ? { id: headers.White, name: headers.White }
          : undefined,
      },
      black: {
        user: headers.Black
          ? { id: headers.Black, name: headers.Black }
          : undefined,
      },
    },
  };
}
