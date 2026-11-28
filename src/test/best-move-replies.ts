import { Chess } from "chess.js";

import type { AnalyzeReply } from "../features/review/GuidedMoveFeedback";

// Rook scores the best move by searching the position after it. Tests that
// mock only the position before a move get the mirrored score for that search.
export function withBestMoveReplies(analyze: AnalyzeReply): AnalyzeReply {
  const mirrored = new Map<string, number>();
  return async (fen, signal, compareAlternatives, purpose) => {
    const reply = await analyze(fen, signal, compareAlternatives, purpose);
    const best = reply?.line[0];
    if (reply && best) {
      try {
        const after = new Chess(fen);
        after.move(best);
        if (!mirrored.has(after.fen()))
          mirrored.set(after.fen(), -reply.evaluationCpFromSideToMove);
      } catch {
        // An illegal mocked line has no position to mirror.
      }
    }
    const score = mirrored.get(fen);
    return (
      reply ??
      (score === undefined
        ? null
        : { line: [], evaluationCpFromSideToMove: score })
    );
  };
}
