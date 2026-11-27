import { z } from "zod";
import { DEFAULT_PGN_LIMITS } from "../domain/import/pgn-parser";
import {
  chessComGamePath,
  isChessComUsername,
  type CompletedGameExport,
} from "./external-game";

const archiveOrigin = "https://api.chess.com";
const lookupBatchSize = 3;
const archivesList = z.object({ archives: z.array(z.string()) });
const archiveGames = z.object({ games: z.array(z.unknown()) });
const gameUrl = z.object({ url: z.url() });
const seat = z.object({ username: z.string().refine(isChessComUsername) });
const finishedGame = z.object({
  end_time: z.number().int().positive(),
  rules: z.literal("chess"),
  pgn: z.string().min(1).max(DEFAULT_PGN_LIMITS.maxBytes),
  white: seat,
  black: seat,
});

export class ChessComArchiveMiss extends Error {
  constructor(readonly hasOlder: boolean) {
    super(
      "Chess.com’s archive hasn’t returned this game. Recently finished games can take time to appear.",
    );
  }
}

async function readArchive(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "Chess.com is rate limiting requests. Try again shortly."
        : "ChessCue couldn’t load the Chess.com archive. Check your connection or import the PGN.",
    );
  }
  return response.json();
}

export async function fetchChessComGame(
  route: string,
  batch: number,
  signal: AbortSignal,
): Promise<CompletedGameExport> {
  const [, kind, id, username] = route.split("/");
  if (
    (kind !== "live" && kind !== "daily") ||
    !id ||
    !isChessComUsername(username)
  ) {
    throw new Error("Open a finished Chess.com game and try again.");
  }
  const target = chessComGamePath(`/game/${kind}/${id}`);
  if (!target) throw new Error("Open a finished Chess.com game and try again.");

  const base = "/pub/player/" + username.toLowerCase() + "/games/";
  const request = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
  const list = archivesList.safeParse(
    await readArchive(archiveOrigin + base + "archives", request),
  );
  if (!list.success)
    throw new Error("Chess.com returned an unreadable archive list.");
  const archives = [...new Set(list.data.archives)]
    .filter((value) => {
      try {
        const url = new URL(value);
        return (
          url.origin === archiveOrigin &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname.startsWith(base) &&
          /^\d{4}\/(0[1-9]|1[0-2])$/.test(url.pathname.slice(base.length))
        );
      } catch {
        return false;
      }
    })
    .sort()
    .reverse();

  const offset = batch * lookupBatchSize;
  for (const archive of archives.slice(offset, offset + lookupBatchSize)) {
    const month = archiveGames.safeParse(await readArchive(archive, request));
    if (!month.success)
      throw new Error("Chess.com returned an unreadable game archive.");
    for (const entry of month.data.games) {
      const candidate = gameUrl.safeParse(entry);
      if (!candidate.success) continue;
      const url = new URL(candidate.data.url);
      if (
        (url.origin !== "https://www.chess.com" &&
          url.origin !== "https://chess.com") ||
        chessComGamePath(url.pathname) !== target
      ) {
        continue;
      }
      const checked = finishedGame.safeParse(entry);
      if (
        !checked.success ||
        !/^\[Result\s+"(?:1-0|0-1|1\/2-1\/2)"\]\s*$/m.test(checked.data.pgn)
      ) {
        throw new Error(
          "ChessCue needs a finished standard chess game with a readable PGN.",
        );
      }
      const { pgn, white, black } = checked.data;
      return {
        id,
        pgn,
        players: {
          white: { user: { name: white.username, id: white.username } },
          black: { user: { name: black.username, id: black.username } },
        },
      };
    }
  }
  throw new ChessComArchiveMiss(offset + lookupBatchSize < archives.length);
}
