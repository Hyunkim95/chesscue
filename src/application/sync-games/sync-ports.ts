import type { GameRecord } from "../../domain/game/types";
import type { Result } from "../../shared/result/result";

export type RemoteGameWriteResult = "created" | "already-present";

export type RemoteSyncFailure =
  | { readonly code: "offline"; readonly message: string }
  | { readonly code: "unauthorized"; readonly message: string }
  | { readonly code: "conflict"; readonly message: string }
  | { readonly code: "invalid-record"; readonly message: string }
  | { readonly code: "unavailable"; readonly message: string };

export interface RemoteGameStore {
  createIfAbsent(
    record: GameRecord,
  ): Promise<Result<RemoteGameWriteResult, RemoteSyncFailure>>;
}
