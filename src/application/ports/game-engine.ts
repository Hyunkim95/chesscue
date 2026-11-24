import type { Result } from "../../shared/result/result";
import type { PositionId } from "../../domain/game/types";

export interface EngineMove {
  readonly uci: string;
  readonly san?: string;
}

export type EngineFailure =
  | { readonly code: "not-ready" }
  | { readonly code: "cancelled" }
  | { readonly code: "timeout" }
  | { readonly code: "crashed"; readonly message: string };

export interface EngineMoveRequest {
  readonly positionId: PositionId;
  readonly fen: string;
  readonly moves: readonly string[];
  readonly targetElo: number;
  readonly timeBudgetMs: number;
  readonly signal: AbortSignal;
}

export interface GameEngine {
  initialize(signal: AbortSignal): Promise<Result<void, EngineFailure>>;
  chooseMove(
    request: EngineMoveRequest,
  ): Promise<Result<EngineMove, EngineFailure>>;
  dispose(): void;
}
