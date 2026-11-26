import { Chess } from "chess.js";
import type { AnalysisEngine } from "./analysis-engine";

export interface ReviewReply {
  readonly line: readonly string[];
  readonly evidenceLine?: readonly string[];
  readonly evaluationCpFromSideToMove: number;
  readonly alternativeEvaluationCp?: number;
}

export const EXPLANATION_LINE_PLIES = 20;
export const EXPLANATION_SEARCH_MS = 5_000;

function checkedContinuation(
  fen: string,
  moves: readonly string[],
  maximumPlies: number,
) {
  const line: string[] = [];
  try {
    const board = new Chess(fen);
    for (const uci of moves.slice(0, maximumPlies)) {
      if (board.isGameOver()) break;
      if (board.move(uci).lan !== uci) return line.length >= 3 ? line : [];
      line.push(uci);
    }
  } catch {
    return line.length >= 3 ? line : [];
  }
  return line;
}

export async function evaluateReviewReply(
  engine: AnalysisEngine,
  fen: string,
  signal: AbortSignal,
  compareAlternatives = false,
  purpose?: "explanation",
): Promise<ReviewReply | null> {
  const initialized = await engine.initialize(signal);
  if (!initialized.ok || signal.aborted) return null;
  const result = await engine.analyze({
    fen,
    signal,
    multiPv: compareAlternatives ? 2 : 1,
    timeBudgetMs: purpose === "explanation" ? EXPLANATION_SEARCH_MS : 350,
  });
  if (!result.ok) return null;
  const checked = result.value.candidates.flatMap((candidate) => {
    const evidenceLine = checkedContinuation(
      fen,
      candidate.principalVariation,
      purpose === "explanation" ? EXPLANATION_LINE_PLIES : 12,
    );
    if (
      evidenceLine[0] !== candidate.uci ||
      !Number.isFinite(candidate.evaluationCpFromSideToMove)
    )
      return [];
    return [
      {
        line: evidenceLine.slice(0, 3),
        ...(evidenceLine.length > 3 && { evidenceLine }),
        evaluationCpFromSideToMove: candidate.evaluationCpFromSideToMove,
        depth: candidate.depth,
      },
    ];
  });
  const [best, alternative] = checked;
  if (best === undefined) return null;
  return {
    line: best.line,
    ...(best.evidenceLine && { evidenceLine: best.evidenceLine }),
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
