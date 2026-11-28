import { LoadingText } from "../../shared/loading/LoadingState";
import { isMateScore } from "../../domain/analysis/classify-experiment";
import type { AssessmentState } from "../board/use-eval-bar";

const barLimit = 600;

// Stockfish's score for the review position, as a number. The bar itself
// sits beside the board; this is the readout under it.
export function RookEvaluation({
  state,
  hidden,
}: {
  readonly state: AssessmentState;
  readonly hidden?: boolean;
}) {
  if (state.kind !== "ready") {
    return (
      <div className="rook-evaluation" role="status" hidden={hidden}>
        {state.kind === "checking" ? (
          <LoadingText>Checking evaluation…</LoadingText>
        ) : (
          "Evaluation unavailable"
        )}
      </div>
    );
  }
  const result = state.assessment;
  let label = "0.0";
  let accessibleLabel = "Even";
  let score = 0;
  if (result.kind === "draw") {
    label = accessibleLabel = "Draw";
  } else if (
    result.kind === "checkmate" ||
    isMateScore(result.whiteCentipawns)
  ) {
    const white =
      result.kind === "checkmate"
        ? result.winner === "white"
        : result.whiteCentipawns > 0;
    score = white ? barLimit : -barLimit;
    label = white ? "White mate" : "Black mate";
    accessibleLabel = label;
  } else {
    const value = result.whiteCentipawns;
    score = Math.max(-barLimit, Math.min(barLimit, value));
    const pawns = (Math.abs(value) / 100).toFixed(1);
    if (value !== 0) {
      label = (value > 0 ? "+" : "−") + pawns;
      accessibleLabel = (value > 0 ? "White" : "Black") + " ahead by " + pawns;
    }
  }
  return (
    <div
      className="rook-evaluation"
      hidden={hidden}
      role="meter"
      aria-label="Stockfish evaluation"
      aria-valuemin={-barLimit}
      aria-valuemax={barLimit}
      aria-valuenow={score}
      aria-valuetext={accessibleLabel}
    >
      <span aria-hidden="true">Stockfish</span>
      <strong aria-hidden="true">{label}</strong>
    </div>
  );
}
