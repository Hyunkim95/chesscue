import type { MomentAttemptRecord } from "../../domain/progress/types";
import type { Result } from "../../shared/result/result";
import type { RepositoryFailure } from "./game-repository";

// Completed positions. Records are immutable: adding an existing id with
// different content is a conflict (ENGINEERING.md §17.4).
export interface MomentAttemptRepository {
  add(record: MomentAttemptRecord): Promise<Result<void, RepositoryFailure>>;
  listAll(): Promise<Result<readonly MomentAttemptRecord[], RepositoryFailure>>;
}
