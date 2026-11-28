// The report pilot used changes in winning chances, rather than raw centipawn loss.
export const reportMoveGrades = [
  "Best",
  "Excellent",
  "Good",
  "Inaccuracy",
  "Mistake",
  "Blunder",
] as const;

export function reportWinChance(cp: number): number {
  return 100 / (1 + Math.exp(-0.00368208 * cp));
}

export function gradeReportMove(
  bestCp: number,
  playedCp: number,
  matched: boolean,
) {
  const loss = matched
    ? 0
    : Math.max(0, reportWinChance(bestCp) - reportWinChance(playedCp));
  const accuracy = Math.max(
    0,
    Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669),
  );
  const grade =
    loss <= 0.5
      ? "Best"
      : loss <= 2
        ? "Excellent"
        : loss <= 5
          ? "Good"
          : loss <= 10
            ? "Inaccuracy"
            : loss <= 20
              ? "Mistake"
              : "Blunder";
  return { grade, accuracy };
}
