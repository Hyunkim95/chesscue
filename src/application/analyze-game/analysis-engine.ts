import type { Result } from "../../shared/result/result";

export interface AnalysisCandidate {
  readonly uci: string;
  readonly evaluationCpFromSideToMove: number;
  readonly principalVariation: readonly string[];
  readonly depth: number;
}

export interface PositionAnalysis {
  readonly candidates: readonly AnalysisCandidate[];
}

export type AnalysisEngineFailure =
  | { readonly code: "not-ready"; readonly message: string }
  | { readonly code: "cancelled"; readonly message: string }
  | { readonly code: "timeout"; readonly message: string }
  | { readonly code: "crashed"; readonly message: string }
  | { readonly code: "no-analysis"; readonly message: string };

export interface AnalyzePositionRequest {
  readonly fen: string;
  readonly timeBudgetMs: number;
  // Search to this depth from a cleared hash so repeated checks agree.
  // timeBudgetMs still caps the search.
  readonly depth?: number;
  readonly multiPv: number;
  readonly signal: AbortSignal;
}

export interface AnalysisEngine {
  initialize(signal: AbortSignal): Promise<Result<void, AnalysisEngineFailure>>;
  analyze(
    request: AnalyzePositionRequest,
  ): Promise<Result<PositionAnalysis, AnalysisEngineFailure>>;
  dispose(): void;
}
