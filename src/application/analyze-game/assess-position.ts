import { Chess } from "chess.js";

import {
  terminalAssessment,
  type PositionAssessment,
} from "../../domain/game/board-balance";
import { buildVariationFrames } from "../../domain/analysis/replay-game";
import type { AnalysisEngine } from "./analysis-engine";

export type AssessPosition = (
  fen: string,
  signal: AbortSignal,
) => Promise<PositionAssessment | null>;

export async function assessPosition(
  engine: AnalysisEngine,
  fen: string,
  signal: AbortSignal,
): Promise<PositionAssessment | null> {
  const position = new Chess(fen);
  const terminal = terminalAssessment(position);
  if (terminal !== null) return terminal;
  const initialized = await engine.initialize(signal);
  if (!initialized.ok || signal.aborted) return null;
  const result = await engine.analyze({
    fen,
    signal,
    multiPv: 1,
    timeBudgetMs: 220,
  });
  if (!result.ok) return null;
  const candidate = result.value.candidates.find(
    (line) =>
      line.principalVariation[0] === line.uci &&
      Number.isFinite(line.evaluationCpFromSideToMove) &&
      buildVariationFrames(fen, [line.uci]).ok,
  );
  if (candidate === undefined) return null;
  return {
    kind: "estimate",
    whiteCentipawns:
      candidate.evaluationCpFromSideToMove * (position.turn() === "w" ? 1 : -1),
  };
}
