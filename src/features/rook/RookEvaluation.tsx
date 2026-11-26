import { Chess } from "chess.js";
import { useEffect, useState } from "react";

import type { AssessPosition } from "../../application/analyze-game/assess-position";
import {
  terminalAssessment,
  type PositionAssessment,
} from "../../domain/game/board-balance";
import { isMateScore } from "../../domain/analysis/classify-experiment";

const barLimit = 600;

export function RookEvaluation({
  fen,
  assess,
  knownScore,
  checking,
}: {
  readonly fen: string;
  readonly assess?: AssessPosition | null | undefined;
  readonly knownScore?: number | undefined;
  readonly checking: boolean;
}) {
  const [response, setResponse] = useState<{
    readonly fen: string;
    readonly value: PositionAssessment | null;
  } | null>(null);
  const terminal = terminalAssessment(new Chess(fen));
  const search =
    assess != null &&
    !checking &&
    terminal === null &&
    knownScore === undefined &&
    response?.fen !== fen;
  useEffect(() => {
    if (!search) return;
    const controller = new AbortController();
    void assess(fen, controller.signal)
      .catch(() => null)
      .then((value) => {
        if (!controller.signal.aborted) setResponse({ fen, value });
      });
    return () => {
      controller.abort();
    };
  }, [assess, fen, search]);

  const result =
    terminal ??
    (knownScore === undefined
      ? response?.fen === fen
        ? response.value
        : null
      : { kind: "estimate", whiteCentipawns: knownScore });
  if (result === null) {
    return (
      <div className="rook-evaluation" role="status">
        {search || checking ? "Checking evaluation…" : "Evaluation unavailable"}
      </div>
    );
  }

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
  const estimatedShare = 50 + (score / barLimit) * 50;
  const whiteShare =
    result.kind === "estimate" && !isMateScore(result.whiteCentipawns)
      ? Math.max(4, Math.min(96, estimatedShare))
      : estimatedShare;
  return (
    <div className="rook-evaluation">
      <span>Stockfish</span>
      <div
        className="rook-evaluation__bar"
        role="meter"
        aria-label="Stockfish evaluation"
        aria-valuemin={-barLimit}
        aria-valuemax={barLimit}
        aria-valuenow={score}
        aria-valuetext={accessibleLabel}
      >
        <span
          aria-hidden="true"
          data-side="white"
          style={{ width: String(whiteShare) + "%" }}
        />
        <span
          aria-hidden="true"
          data-side="black"
          style={{ width: String(100 - whiteShare) + "%" }}
        />
      </div>
      <strong aria-hidden="true">{label}</strong>
    </div>
  );
}
