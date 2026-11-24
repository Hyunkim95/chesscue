import type { LearningTheme } from "../../domain/analysis/types";
import type { Result } from "../../shared/result/result";

import type { RepositoryFailure } from "./game-repository";

export interface ReviewEvidenceRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly gameId: string;
  readonly analysisVersion: string;
  readonly theme: LearningTheme;
  readonly firstAttemptScore: number;
  readonly originalAttemptScore?: number;
  readonly closeTransferScore?: number | null;
  readonly unlabeledTransferScore?: number | null;
  readonly hardSpot: string;
  readonly dueReview: string;
  readonly reinforcement: string;
  readonly transfer: "completed" | "scheduled-next-game";
  readonly completedAt: string;
}

export interface ReviewEvidenceRepository {
  get(
    id: string,
  ): Promise<Result<ReviewEvidenceRecord | null, RepositoryFailure>>;
  put(record: ReviewEvidenceRecord): Promise<Result<void, RepositoryFailure>>;
  listAll(): Promise<
    Result<readonly ReviewEvidenceRecord[], RepositoryFailure>
  >;
  listByGame(
    gameId: string,
  ): Promise<Result<readonly ReviewEvidenceRecord[], RepositoryFailure>>;
  listByTheme(
    theme: LearningTheme,
  ): Promise<Result<readonly ReviewEvidenceRecord[], RepositoryFailure>>;
  listDue(
    onOrBefore: string,
  ): Promise<Result<readonly ReviewEvidenceRecord[], RepositoryFailure>>;
}
