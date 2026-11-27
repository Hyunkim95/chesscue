import { Chess } from "chess.js";

import { feedbackTier } from "../../domain/session/feedback-tier";
import type { Attempt } from "../../domain/session/types";
import { err, ok, type Result } from "../../shared/result/result";
import type {
  AnalysisEngine,
  AnalysisEngineFailure,
} from "../analyze-game/analysis-engine";

// A position the player is solving, with Stockfish's verified best line.
export interface MomentPosition {
  readonly fen: string;
  readonly bestUci: string;
  // Evaluation of the best move for the player, in centipawns.
  readonly bestCp: number;
  // The best line, starting with bestUci.
  readonly solutionLine: readonly string[];
}

export interface CheckedTry {
  readonly attempt: Attempt;
  // The position after the tried move.
  readonly afterFen: string;
  // The position after Rook's reply, when there is one.
  readonly replyFen: string | undefined;
  readonly replySan: string | undefined;
  readonly playedCp: number;
}

export type CheckFailure =
  | { readonly code: "illegal"; readonly message: string }
  | AnalysisEngineFailure;

// Mate scores, matching the engine adapter's mapping.
const MATED_CP = 100_000;

export const TRY_SEARCH = { depth: 14, timeBudgetMs: 2_000 } as const;

function play(fen: string, uci: string) {
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    });
  } catch {
    return undefined;
  }
}

// Check a tried move with Stockfish: its tier and Rook's answer. Works the
// same for a real try and for a "What if …?" preview, which is not recorded.
export async function checkTry({
  position,
  uci,
  engine,
  signal,
}: {
  readonly position: MomentPosition;
  readonly uci: string;
  readonly engine: AnalysisEngine;
  readonly signal: AbortSignal;
}): Promise<Result<CheckedTry, CheckFailure>> {
  const move = play(position.fen, uci);
  if (!move)
    return err({ code: "illegal", message: `${uci} is not legal here.` });
  const after = new Chess(move.after);
  let playedCp: number;
  let replyUci: string | undefined;
  if (after.isCheckmate()) playedCp = MATED_CP;
  else if (after.isDraw()) playedCp = 0;
  else if (move.lan === position.bestUci) {
    playedCp = position.bestCp;
    replyUci = position.solutionLine[1];
  } else {
    const analysis = await engine.analyze({
      fen: move.after,
      multiPv: 1,
      signal,
      ...TRY_SEARCH,
    });
    if (!analysis.ok) return analysis;
    const [top] = analysis.value.candidates;
    if (!top)
      return err({
        code: "no-analysis",
        message: "Stockfish returned no move.",
      });
    playedCp = -top.evaluationCpFromSideToMove;
    replyUci = top.uci;
  }
  const reply = replyUci === undefined ? undefined : play(move.after, replyUci);
  const tier = feedbackTier({ bestCp: position.bestCp, playedCp });
  return ok({
    attempt: {
      uci: move.lan,
      san: move.san,
      tier,
      ...(reply ? { replyUci: reply.lan } : {}),
    },
    afterFen: move.after,
    replyFen: reply?.after,
    replySan: reply?.san,
    playedCp,
  });
}
