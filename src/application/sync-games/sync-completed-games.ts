import type {
  GameRepository,
  RepositoryFailure,
} from "../../application/ports/game-repository";
import type { GameId } from "../../domain/game/types";
import { ok, type Result } from "../../shared/result/result";

import type { RemoteGameStore, RemoteSyncFailure } from "./sync-ports";

export interface SyncItemFailure {
  readonly gameId: GameId;
  readonly error: RemoteSyncFailure;
}

export interface SyncReport {
  readonly created: readonly GameId[];
  readonly alreadyPresent: readonly GameId[];
  readonly failed: readonly SyncItemFailure[];
}

export const syncCompletedGames = async (
  local: GameRepository,
  remote: RemoteGameStore,
): Promise<Result<SyncReport, RepositoryFailure>> => {
  const localResult = await local.listCompleted();
  if (!localResult.ok) {
    return localResult;
  }

  const created: GameId[] = [];
  const alreadyPresent: GameId[] = [];
  const failed: SyncItemFailure[] = [];

  for (const game of localResult.value) {
    const remoteResult = await remote.createIfAbsent(game);
    if (!remoteResult.ok) {
      failed.push({ gameId: game.id, error: remoteResult.error });
    } else if (remoteResult.value === "created") {
      created.push(game.id);
    } else {
      alreadyPresent.push(game.id);
    }
  }

  return ok({ created, alreadyPresent, failed });
};
