import type {
  LearningMoment,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import type { Result } from "../../shared/result/result";

import type { RepositoryFailure } from "./game-repository";

export interface AnalysisSearchSettings {
  readonly timeBudgetPerPositionMs: number;
  readonly multiPv: number;
}

export interface AnalysisRecord {
  readonly schemaVersion: 1;
  readonly gameId: string;
  readonly analysisVersion: string;
  readonly engineBuild: string;
  readonly searchSettings: AnalysisSearchSettings;
  readonly facts: readonly MoveAnalysisFact[];
  readonly moments: readonly LearningMoment[];
  readonly analyzedPlayerMoves: number;
  readonly validationStatus: "validated";
  readonly analyzedAt: string;
}

export interface AnalysisRepository {
  get(
    gameId: string,
    analysisVersion: string,
  ): Promise<Result<AnalysisRecord | null, RepositoryFailure>>;
  put(record: AnalysisRecord): Promise<Result<void, RepositoryFailure>>;
  listAll(): Promise<Result<readonly AnalysisRecord[], RepositoryFailure>>;
  listByGame(
    gameId: string,
  ): Promise<Result<readonly AnalysisRecord[], RepositoryFailure>>;
}
