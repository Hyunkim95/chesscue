import { REVIEW_MOVE_TOLERANCE_CP } from "../analysis/review-training";
import type { FeedbackTier } from "./types";

// Tier boundaries from the design (§3.2), in centipawns for the player.
export const STILL_LEVEL_CP = -100;
export const COSTLY_BELOW_CP = -400;

// How a tried move compares with the best one. Both evaluations are from
// the player's side after the move; mates are already mapped to large
// centipawn values by the engine adapter.
export function feedbackTier({
  bestCp,
  playedCp,
  toleranceCp = REVIEW_MOVE_TOLERANCE_CP,
}: {
  readonly bestCp: number;
  readonly playedCp: number;
  readonly toleranceCp?: number;
}): FeedbackTier {
  if (bestCp - playedCp <= toleranceCp) return "best";
  if (playedCp >= STILL_LEVEL_CP) return "missed";
  if (playedCp >= COSTLY_BELOW_CP) return "worse";
  return "costly";
}
