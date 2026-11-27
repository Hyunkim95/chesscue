import { XP, type MomentAttemptRecord } from "./types";

const outcomeXp: Record<MomentAttemptRecord["outcome"], number> = {
  spotted: XP.spotted,
  "found-on-retry": XP.foundOnRetry,
  shown: 0,
};

export function totalXp(attempts: readonly MomentAttemptRecord[]): number {
  return attempts.reduce(
    (total, { outcome, explorations }) =>
      total +
      outcomeXp[outcome] +
      Math.min(XP.exploration * explorations, XP.explorationCap),
    0,
  );
}
