import type { MomentAttemptRecord } from "./types";
import type { AchievementId, CurriculumStage, StarState } from "./types";

export interface AchievementInput {
  readonly attempts: readonly MomentAttemptRecord[];
  readonly stars: ReadonlyMap<string, StarState>;
  readonly streakBest: number;
  readonly curriculum: readonly CurriculumStage[];
}

const WEEK_ONE_DAYS = 7;
const COLLECTOR_STARS = 10;
const NIGHT_OWL_POSITIONS = 3;
const NIGHT_OWL_GAP_MS = 30 * 60 * 1000;

interface TimedRecord {
  readonly record: MomentAttemptRecord;
  readonly at: number;
}

interface TimedAchievement {
  readonly id: AchievementId;
  readonly earnedAt: number;
}

// Earned achievements in the order they were earned. Those dated by an
// attempt come first; the ones read from current stars and streak follow.
export function earnedAchievements(
  input: AchievementInput,
): readonly AchievementId[] {
  const records = chronological(input.attempts);
  const timed = [...spottedAchievements(records), ...nightOwl(records)].sort(
    (a, b) => a.earnedAt - b.earnedAt || a.id.localeCompare(b.id),
  );
  return [...timed.map(({ id }) => id), ...untimedAchievements(input)];
}

function chronological(
  attempts: readonly MomentAttemptRecord[],
): readonly TimedRecord[] {
  return attempts
    .map((record) => ({ record, at: Date.parse(record.completedAt) }))
    .sort((a, b) => a.at - b.at || a.record.id.localeCompare(b.record.id));
}

// "first-idea" and one "first-unit:" per unit, each at its first spotted
// record.
function spottedAchievements(
  records: readonly TimedRecord[],
): readonly TimedAchievement[] {
  const earned = new Map<AchievementId, number>();
  for (const { record, at } of records) {
    if (record.outcome !== "spotted") continue;
    if (!earned.has("first-idea")) earned.set("first-idea", at);
    if (record.unitId === undefined) continue;
    const id: AchievementId = `first-unit:${record.unitId}`;
    if (!earned.has(id)) earned.set(id, at);
  }
  return [...earned].map(([id, earnedAt]) => ({ id, earnedAt }));
}

// Earned at the third of three completed positions with at most 30 minutes
// between consecutive ones.
function nightOwl(
  records: readonly TimedRecord[],
): readonly TimedAchievement[] {
  let run = 0;
  let previous: number | undefined;
  for (const { at } of records) {
    run =
      previous !== undefined && at - previous <= NIGHT_OWL_GAP_MS ? run + 1 : 1;
    previous = at;
    if (run === NIGHT_OWL_POSITIONS) return [{ id: "night-owl", earnedAt: at }];
  }
  return [];
}

function untimedAchievements(
  input: AchievementInput,
): readonly AchievementId[] {
  const isLit = (unitId: string): boolean => {
    const state = input.stars.get(unitId);
    return state === "spotted" || state === "shining";
  };
  const earned: AchievementId[] = [];
  if ([...input.stars.values()].includes("shining")) earned.push("played-it");
  if (input.streakBest >= WEEK_ONE_DAYS) earned.push("week-one");
  if ([...input.stars.keys()].filter(isLit).length >= COLLECTOR_STARS)
    earned.push("collector");
  for (const { stageId, unitIds } of input.curriculum) {
    const id: AchievementId = `full-constellation:${stageId}`;
    // An empty stage has nothing to light, so it earns nothing.
    if (unitIds.length > 0 && unitIds.every(isLit) && !earned.includes(id))
      earned.push(id);
  }
  return earned;
}
