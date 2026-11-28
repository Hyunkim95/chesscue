import type {
  GameId,
  GameRecord,
  TutorGameMode,
} from "../../domain/game/types";
import type { Result } from "../../shared/result/result";

export type RepositoryFailure =
  | { readonly code: "unavailable"; readonly message: string }
  | { readonly code: "conflict"; readonly message: string }
  | { readonly code: "invalid-record"; readonly message: string };

export interface GameRepository {
  get(id: GameId): Promise<Result<GameRecord | null, RepositoryFailure>>;
  put(record: GameRecord): Promise<Result<void, RepositoryFailure>>;
  getLatestInProgress(
    mode?: TutorGameMode,
  ): Promise<Result<GameRecord | null, RepositoryFailure>>;
  listCompleted(): Promise<Result<readonly GameRecord[], RepositoryFailure>>;
}

// Where the next page of completed games starts: after this game.
export interface GamePageCursor {
  readonly order: number;
  readonly id: string;
}

// Completed games newest first, a page at a time, so a long history never has
// to be read whole to show its first rows.
export interface CompletedGamePages {
  listCompletedPage(
    after: GamePageCursor | null,
    limit: number,
  ): Promise<
    Result<
      {
        readonly games: readonly GameRecord[];
        readonly next: GamePageCursor | null;
      },
      RepositoryFailure
    >
  >;
}
