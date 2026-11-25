import { buildVariationFrames } from "../../domain/analysis/replay-game";
import type { AnalysisEngine } from "./analysis-engine";

export interface ReviewReply {
  readonly line: readonly string[];
  readonly evaluationCpFromSideToMove: number;
}

export async function evaluateReviewReply(
  engine: AnalysisEngine,
  fen: string,
  signal: AbortSignal,
): Promise<ReviewReply | null> {
  const initialized = await engine.initialize(signal);
  if (!initialized.ok || signal.aborted) return null;
  const result = await engine.analyze({
    fen,
    signal,
    multiPv: 1,
    timeBudgetMs: 350,
  });
  if (!result.ok) return null;
  for (const candidate of result.value.candidates) {
    const line = candidate.principalVariation.slice(0, 3);
    if (
      line[0] === candidate.uci &&
      Number.isFinite(candidate.evaluationCpFromSideToMove) &&
      buildVariationFrames(fen, line).ok
    )
      return {
        line,
        evaluationCpFromSideToMove: candidate.evaluationCpFromSideToMove,
      };
  }
  return null;
}
