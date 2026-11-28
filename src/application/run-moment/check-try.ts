import { Chess, type Move } from "chess.js";

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
  // Installed puzzles can open before the local engine reads this score.
  readonly bestCp: number | undefined;
  // The best line, starting with bestUci.
  readonly solutionLine: readonly string[];
  // How close to the best move counts as finding it; wider for plans.
  readonly toleranceCp?: number;
}

export interface CheckedTry {
  readonly attempt: Attempt;
  // The position after the tried move.
  readonly afterFen: string;
  // The position after Rook's reply, when there is one.
  readonly replyFen: string | undefined;
  readonly replySan: string | undefined;
  readonly playedCp: number | undefined;
  // How far the tried move trails the best one, in centipawns for the player.
  readonly gapCp: number | undefined;
  // The tried move and Stockfish's line after it, so a good move of the
  // player's own can be replayed as it is rather than as Rook's main line.
  readonly line: readonly string[];
}

export type CheckFailure =
  | { readonly code: "illegal"; readonly message: string }
  | AnalysisEngineFailure;

// Mate scores, matching the engine adapter's mapping.
const MATED_CP = 100_000;

export const TRY_SEARCH = { depth: 14, timeBudgetMs: 2_000 } as const;

const baselines = new WeakMap<
  MomentPosition,
  { readonly engine: AnalysisEngine; readonly score: number }
>();

function isQuiet(move: Move): boolean {
  return (
    move.captured === undefined &&
    move.promotion === undefined &&
    !/[+#]$/.test(move.san)
  );
}

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
  const cancelled = () => signal.aborted;
  if (cancelled())
    return err({ code: "cancelled", message: "Position check cancelled." });
  const move = play(position.fen, uci);
  if (!move)
    return err({ code: "illegal", message: `${uci} is not legal here.` });
  const followsSolution = move.lan === position.bestUci;
  const cached = baselines.get(position);
  let bestCp =
    position.bestCp ?? (cached?.engine === engine ? cached.score : undefined);
  if (bestCp === undefined && !followsSolution) {
    const analysis = await engine.analyze({
      fen: position.fen,
      multiPv: 1,
      signal,
      ...TRY_SEARCH,
    });
    if (!analysis.ok) return analysis;
    if (cancelled())
      return err({ code: "cancelled", message: "Position check cancelled." });
    bestCp = analysis.value.candidates[0]?.evaluationCpFromSideToMove;
    if (bestCp === undefined)
      return err({
        code: "no-analysis",
        message: "Stockfish returned no move.",
      });
    baselines.set(position, { engine, score: bestCp });
  }
  const after = new Chess(move.after);
  let playedCp: number | undefined;
  let replyUci: string | undefined;
  let continuation: readonly string[] = [];
  if (after.isCheckmate()) playedCp = MATED_CP;
  else if (after.isDraw()) playedCp = 0;
  else if (followsSolution) {
    playedCp = bestCp;
    replyUci = position.solutionLine[1];
    continuation = position.solutionLine.slice(1);
  } else {
    const analysis = await engine.analyze({
      fen: move.after,
      multiPv: 1,
      signal,
      ...TRY_SEARCH,
    });
    if (!analysis.ok) return analysis;
    if (cancelled())
      return err({ code: "cancelled", message: "Position check cancelled." });
    const [top] = analysis.value.candidates;
    if (!top)
      return err({
        code: "no-analysis",
        message: "Stockfish returned no move.",
      });
    playedCp = -top.evaluationCpFromSideToMove;
    replyUci = top.uci;
    continuation =
      top.principalVariation[0] === top.uci
        ? top.principalVariation
        : [top.uci];
  }
  const reply = replyUci === undefined ? undefined : play(move.after, replyUci);
  const tier =
    bestCp === undefined || playedCp === undefined
      ? "best"
      : feedbackTier({
          bestCp,
          playedCp,
          // A plan moment accepts nearby quiet moves. A capture, check or
          // promotion changes the position, so it must be as good as the
          // best move (owner decision, 28 November 2026).
          ...(position.toleranceCp === undefined || !isQuiet(move)
            ? {}
            : { toleranceCp: position.toleranceCp }),
        });
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
    gapCp:
      bestCp === undefined || playedCp === undefined
        ? undefined
        : bestCp - playedCp,
    line: [move.lan, ...continuation],
  });
}
