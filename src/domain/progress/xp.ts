import { XP, type MomentAttemptRecord } from "./types";

const outcomeXp: Record<MomentAttemptRecord["outcome"], number> = {
  spotted: XP.spotted,
  "found-on-retry": XP.foundOnRetry,
  shown: 0,
};

// XP for one completed position.
export function attemptXp({
  outcome,
  explorations,
}: Pick<MomentAttemptRecord, "outcome" | "explorations">): number {
  return (
    outcomeXp[outcome] +
    Math.min(XP.exploration * explorations, XP.explorationCap)
  );
}

export function totalXp(attempts: readonly MomentAttemptRecord[]): number {
  return attempts.reduce((total, attempt) => total + attemptXp(attempt), 0);
}
