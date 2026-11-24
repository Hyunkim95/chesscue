import { describe, expect, it } from "vitest";

import type { GameRepository } from "../ports/game-repository";
import type { GameId, GameRecord } from "../../domain/game/types";
import { err, ok } from "../../shared/result/result";

import { syncCompletedGames } from "./sync-completed-games";
import type { RemoteGameStore } from "./sync-ports";

const completedGame = (id: string): GameRecord => ({
  schemaVersion: 1,
  id: id as GameId,
  origin: { type: "tutor" },
  initialFen: "start",
  moves: [],
  pgn: "1-0",
  playerColor: "white",
  result: "white-win",
  createdAt: "2026-11-24T12:00:00.000Z",
  completedAt: "2026-11-24T12:10:00.000Z",
  curriculumVersion: "1.0.0",
  configurationVersion: "1.0.0",
  fingerprint: null,
});

describe("completed game synchronization", () => {
  it("reports independent successes and failures without losing local records", async () => {
    const games = [
      completedGame("game-1"),
      completedGame("game-2"),
      completedGame("game-3"),
    ];
    const local: GameRepository = {
      get: () => Promise.resolve(ok(null)),
      put: () => Promise.resolve(ok(undefined)),
      listCompleted: () => Promise.resolve(ok(games)),
    };
    const remote: RemoteGameStore = {
      createIfAbsent: (game) => {
        if (game.id === games[0]?.id) return Promise.resolve(ok("created"));
        if (game.id === games[1]?.id)
          return Promise.resolve(ok("already-present"));
        return Promise.resolve(
          err({ code: "offline", message: "Network unavailable." }),
        );
      },
    };

    expect(await syncCompletedGames(local, remote)).toEqual({
      ok: true,
      value: {
        created: [games[0]?.id],
        alreadyPresent: [games[1]?.id],
        failed: [
          {
            gameId: games[2]?.id,
            error: { code: "offline", message: "Network unavailable." },
          },
        ],
      },
    });
  });
});
