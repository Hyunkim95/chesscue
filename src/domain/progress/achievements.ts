// Workstream 3 implements this. The signature is part of the frozen
// contract so deriveProgress (workstream 2) can call it.
import type { MomentAttemptRecord } from "./types";
import type { AchievementId, CurriculumStage, StarState } from "./types";

export interface AchievementInput {
  readonly attempts: readonly MomentAttemptRecord[];
  readonly stars: ReadonlyMap<string, StarState>;
  readonly streakBest: number;
  readonly curriculum: readonly CurriculumStage[];
}

// Earned achievements in the order they were earned.
export const earnedAchievements: (
  input: AchievementInput,
) => readonly AchievementId[] = () => [];
