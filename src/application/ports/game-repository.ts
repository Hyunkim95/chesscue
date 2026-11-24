import type { GameId, GameRecord } from "../../domain/game/types";
import type { Result } from "../../shared/result/result";

export type RepositoryFailure =
  | { readonly code: "unavailable"; readonly message: string }
  | { readonly code: "conflict"; readonly message: string }
  | { readonly code: "invalid-record"; readonly message: string };

export interface GameRepository {
  get(id: GameId): Promise<Result<GameRecord | null, RepositoryFailure>>;
  put(record: GameRecord): Promise<Result<void, RepositoryFailure>>;
  listCompleted(): Promise<Result<readonly GameRecord[], RepositoryFailure>>;
}
