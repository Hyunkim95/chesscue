import { Chess, type Move } from "chess.js";
import { useEffect, useRef, useState } from "react";

import {
  EXPLANATION_LINE_PLIES,
  type ReviewReply,
} from "../../application/analyze-game/analyze-review-reply";
import { moveLossCp } from "../../domain/analysis/classify-experiment";
import { REVIEW_MOVE_TOLERANCE_CP } from "../../domain/analysis/review-training";
import { RookMessage } from "../../shared/rook/RookMessage";
import type { AnalyzeReply } from "../review/GuidedMoveFeedback";
import { proveLinePlan } from "./prove-line-plan";

type State =
  | { status: "idle" | "checking" | "unresolved" }
  | {
      status: "verified";
      text: string;
      version: string;
      line: readonly Move[];
    };

function replay(board: Chess, reply: ReviewReply) {
  return (reply.evidenceLine ?? reply.line).map((uci) => board.move(uci));
}

export function StrongerMoveExplanation({
  attempt,
  analyzeReply,
  onVerified,
}: {
  readonly attempt: Move;
  readonly analyzeReply: AnalyzeReply;
  readonly onVerified?: (
    line: readonly Move[],
    text: string,
    version: string,
  ) => void;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const pending = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      pending.current?.abort();
    },
    [],
  );
  async function check() {
    pending.current?.abort();
    const owner = new AbortController();
    pending.current = owner;
    const signal = AbortSignal.any([owner.signal, AbortSignal.timeout(19000)]);
    setState({ status: "checking" });
    let outcome: State = { status: "unresolved" };
    try {
      const before = await analyzeReply(
        attempt.before,
        signal,
        false,
        "explanation",
      );
      signal.throwIfAborted();
      if (!before || before.line[0] === attempt.lan) return;
      const after = await analyzeReply(
        attempt.after,
        signal,
        false,
        "explanation",
      );
      signal.throwIfAborted();
      if (
        !after ||
        moveLossCp(
          before.evaluationCpFromSideToMove,
          after.evaluationCpFromSideToMove,
        ) <= REVIEW_MOVE_TOLERANCE_CP
      )
        return;
      const board = new Chess(attempt.before);
      const line = replay(board, before);
      if (line.length > 0 && line.length < 5 && !board.isGameOver()) {
        const tail = await analyzeReply(
          board.fen(),
          signal,
          false,
          "explanation",
        );
        signal.throwIfAborted();
        if (tail) {
          const rest = (tail.evidenceLine ?? tail.line).slice(
            0,
            EXPLANATION_LINE_PLIES - line.length,
          );
          for (const uci of rest) line.push(board.move(uci));
        }
      }
      const plan = await proveLinePlan(
        line,
        [attempt, ...replay(new Chess(attempt.after), after)],
        signal,
        async (fen, branchSignal) => {
          const result = await analyzeReply(fen, branchSignal);
          return result?.evidenceLine ?? result?.line ?? [];
        },
      );
      if (plan && !signal.aborted)
        outcome = {
          status: "verified",
          text: plan.text,
          version: plan.source.version,
          line,
        };
    } catch {
      /* Expired and unavailable checks leave the player free to retry. */
    } finally {
      if (!owner.signal.aborted) {
        setState(outcome);
        if (outcome.status === "verified")
          onVerified?.(outcome.line, outcome.text, outcome.version);
      }
    }
  }
  if (state.status === "verified")
    return (
      <div
        role="group"
        aria-label="Rook’s line explanation"
        data-wording-version={state.version}
      >
        <RookMessage>
          <p>{state.text}</p>
        </RookMessage>
        <details>
          <summary>Checked line</summary>
          <p>{state.line.map((move) => move.san).join(" ")}</p>
        </details>
      </div>
    );
  if (state.status === "unresolved")
    return (
      <p role="status">Rook couldn’t verify why a stronger move works here.</p>
    );
  return (
    <button
      className="game-review__quiet-action"
      type="button"
      disabled={state.status === "checking"}
      aria-busy={state.status === "checking"}
      onClick={() => void check()}
    >
      {state.status === "checking"
        ? "Checking the line…"
        : "Explain stronger move"}
    </button>
  );
}
