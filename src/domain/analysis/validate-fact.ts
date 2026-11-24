import { Chess } from "chess.js";

import type { FactValidationResult, MoveAnalysisFact } from "./types";
import { moveAnalysisFactSchema } from "./types";

function isLegalUci(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen);
    chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

export function validateMoveAnalysisFact(input: unknown): FactValidationResult {
  const parsed = moveAnalysisFactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: parsed.error.issues[0]?.message ?? "Invalid analysis fact.",
    };
  }

  const fact: MoveAnalysisFact = parsed.data;
  if (!isLegalUci(fact.fenBefore, fact.playedMoveUci)) {
    return {
      ok: false,
      reason: "The played move is not legal in the supplied position.",
    };
  }
  if (
    fact.candidates.some(
      (candidate) => !isLegalUci(fact.fenBefore, candidate.uci),
    )
  ) {
    return {
      ok: false,
      reason: "A candidate move is not legal in the supplied position.",
    };
  }

  const expectedImpact = Math.max(
    0,
    fact.evaluationBeforeCp - fact.evaluationAfterCp,
  );
  if (fact.impactCp !== expectedImpact) {
    return {
      ok: false,
      reason: "The impact does not match the supplied evaluations.",
    };
  }

  return { ok: true, fact };
}
