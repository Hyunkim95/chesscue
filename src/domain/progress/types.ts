// Frozen contract (ENGINEERING.md §17.2). Change it only through the lead
// agent, and update §17.2 in the same commit.
import type { ObservedMove } from "../curriculum/game-drill";
import type { FeedbackTier, MomentOutcome } from "../session/types";

// One completed position. Stored immutably in the momentAttempts store;
// every progress value is derived from these records.
export interface MomentAttemptRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly source:
    | { readonly kind: "game"; readonly gameId: string; readonly ply: number }
    | { readonly kind: "puzzle"; readonly puzzleId: string };
  readonly unitId?: string;
  readonly firstMoveUci: string;
  readonly tiers: readonly FeedbackTier[];
  readonly outcome: MomentOutcome;
  // A hint, scan, preview or Show me was used before solving.
  readonly helped: boolean;
  // Distinct tries, previews and questions.
  readonly explorations: number;
  // ISO 8601 timestamp.
  readonly completedAt: string;
}

export type StarState = "not-seen" | "missed" | "spotted" | "shining";

export type AchievementId =
  | "first-idea"
  | `first-unit:${string}`
  | "played-it"
  | "week-one"
  | "collector"
  | `full-constellation:${string}`
  | "night-owl";

export interface IdeaCard {
  readonly unitId: string;
  // Spotted = 1, shining = 2, each further unaided real-game use +1.
  readonly level: number;
}

export interface WeekDay {
  // Local calendar date, YYYY-MM-DD, in the injected time zone.
  readonly date: string;
  readonly done: boolean;
}

export interface Progress {
  readonly xp: number;
  readonly level: number;
  readonly streak: { readonly current: number; readonly best: number };
  readonly dailyGoal: { readonly done: number; readonly target: 3 };
  // The seven local days ending today, oldest first.
  readonly week: readonly WeekDay[];
  // Units with no evidence are absent, which means "not-seen".
  readonly stars: ReadonlyMap<string, StarState>;
  // The unit whose star changed most recently, for the twinkle.
  readonly newestStar: string | undefined;
  readonly achievements: readonly AchievementId[];
  readonly ideas: readonly IdeaCard[];
}

export interface CurriculumStage {
  readonly stageId: string;
  readonly unitIds: readonly string[];
}

export interface ProgressInput {
  readonly attempts: readonly MomentAttemptRecord[];
  readonly games: readonly ObservedMove[];
  readonly curriculum: readonly CurriculumStage[];
  readonly now: Date;
  // IANA time zone, for example "Asia/Dubai".
  readonly timeZone: string;
}

export const DAILY_GOAL = 3;
export const XP_PER_LEVEL = 100;
export const XP = {
  spotted: 25,
  foundOnRetry: 15,
  exploration: 2,
  explorationCap: 10,
} as const;
