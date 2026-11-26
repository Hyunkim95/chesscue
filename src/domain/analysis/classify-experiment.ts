export interface ExperimentEvaluation {
  readonly line: readonly string[];
  readonly evaluationCpFromSideToMove: number;
  readonly alternativeEvaluationCp?: number | undefined;
}

const significantSwingCp = 150;
const encodedMateCp = 99_001;

export function isMateScore(score: number): boolean {
  return Math.abs(score) >= encodedMateCp;
}

function comparableScore(score: number): number {
  if (!isMateScore(score)) return score;
  // Compare winning or losing mate as an outcome, independent of mate distance.
  return Math.sign(score) * 100_000;
}

// The second score is from the next side to move, so negate it before comparing.
export function moveLossCp(before: number, after: number): number {
  return comparableScore(before) - comparableScore(-after);
}

export function classifyExperiment(
  move: string,
  before: ExperimentEvaluation | null,
  after: ExperimentEvaluation,
): "spot" | "standout" | "continue" {
  if (before === null) return "continue";
  const best = comparableScore(before.evaluationCpFromSideToMove);
  if (
    moveLossCp(
      before.evaluationCpFromSideToMove,
      after.evaluationCpFromSideToMove,
    ) >= significantSwingCp
  )
    return "spot";
  if (
    before.line[0] === move &&
    before.alternativeEvaluationCp !== undefined &&
    best - comparableScore(before.alternativeEvaluationCp) >= significantSwingCp
  )
    return "standout";
  return "continue";
}
