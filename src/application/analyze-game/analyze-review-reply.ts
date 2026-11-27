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
// Judging a learner's move searches every compared position to the same depth,
// so the same move always gets the same verdict.
export const JUDGEMENT_DEPTH = 16;
export const JUDGEMENT_SEARCH_MS = 2_000;

export type ReviewSearchPurpose = "explanation" | "judgement";

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
  purpose?: ReviewSearchPurpose,
): Promise<ReviewReply | null> {
  const initialized = await engine.initialize(signal);
  if (!initialized.ok || signal.aborted) return null;
  const result = await engine.analyze({
    fen,
    signal,
    multiPv: compareAlternatives ? 2 : 1,
    timeBudgetMs:
      purpose === "explanation"
        ? EXPLANATION_SEARCH_MS
        : purpose === "judgement"
          ? JUDGEMENT_SEARCH_MS
          : 350,
    ...(purpose === "judgement" && { depth: JUDGEMENT_DEPTH }),
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

type EvaluatePosition = (
  fen: string,
  signal: AbortSignal,
  compareAlternatives?: boolean,
  purpose?: ReviewSearchPurpose,
) => Promise<ReviewReply | null>;

// Scores the best move the way the learner's move was scored: by searching the
// position after it. The best line is kept for explanations.
export async function equalSearchReference(
  evaluate: EvaluatePosition,
  best: ReviewReply,
  move: { readonly before: string; readonly lan: string },
  signal: AbortSignal,
): Promise<ReviewReply | null> {
  const bestMove = best.line[0];
  if (bestMove === undefined || bestMove === move.lan) return best;
  const board = new Chess(move.before);
  try {
    board.move(bestMove);
  } catch {
    return null;
  }
  if (board.isCheckmate())
    return { ...best, evaluationCpFromSideToMove: 99_999 };
  if (board.isDraw()) return { ...best, evaluationCpFromSideToMove: 0 };
  const reply = await evaluate(board.fen(), signal, false, "judgement");
  return (
    reply && {
      ...best,
      evaluationCpFromSideToMove: -reply.evaluationCpFromSideToMove,
    }
  );
}

export async function analyzeReviewReply(
  engine: AnalysisEngine,
  fen: string,
  signal: AbortSignal,
): Promise<readonly string[]> {
  const reply = await evaluateReviewReply(engine, fen, signal);
  return reply?.line ?? [];
}
