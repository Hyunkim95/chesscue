import { buildVariationFrames } from "../../domain/analysis/replay-game";
import type { AnalysisEngine } from "./analysis-engine";

export interface ReviewReply {
  readonly line: readonly string[];
  readonly evaluationCpFromSideToMove: number;
  readonly alternativeEvaluationCp?: number;
}

export async function evaluateReviewReply(
  engine: AnalysisEngine,
  fen: string,
  signal: AbortSignal,
  compareAlternatives = false,
): Promise<ReviewReply | null> {
  const initialized = await engine.initialize(signal);
  if (!initialized.ok || signal.aborted) return null;
  const result = await engine.analyze({
    fen,
    signal,
    multiPv: compareAlternatives ? 2 : 1,
    timeBudgetMs: 350,
  });
  if (!result.ok) return null;
  const checked = result.value.candidates.flatMap((candidate) => {
    const line = candidate.principalVariation.slice(0, 3);
    if (
      line[0] !== candidate.uci ||
      !Number.isFinite(candidate.evaluationCpFromSideToMove) ||
      !buildVariationFrames(fen, line).ok
    )
      return [];
    return [
      {
        line,
        evaluationCpFromSideToMove: candidate.evaluationCpFromSideToMove,
        depth: candidate.depth,
      },
    ];
  });
  const [best, alternative] = checked;
  if (best === undefined) return null;
  return {
    line: best.line,
    evaluationCpFromSideToMove: best.evaluationCpFromSideToMove,
    ...(alternative?.depth === best.depth && {
      alternativeEvaluationCp: alternative.evaluationCpFromSideToMove,
    }),
  };
}

export async function analyzeReviewReply(
  engine: AnalysisEngine,
  fen: string,
  signal: AbortSignal,
): Promise<readonly string[]> {
  const reply = await evaluateReviewReply(engine, fen, signal);
  return reply?.line ?? [];
}
