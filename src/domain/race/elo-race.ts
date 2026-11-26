import { z } from "zod";
import { placementCount, type RatingEntry } from "../game/rating";

export const raceId = z.uuid();
export const goalSchema = z.object({
  kind: z.enum(["gain", "milestone"]),
  value: z.number().int().positive().max(10000),
});
export type RaceGoal = z.infer<typeof goalSchema>;
export const raceSchema = z.object({ version: z.literal(1), goal: goalSchema });
const elo = z.number().int().nonnegative();
export const memberSchema = z.object({
  name: z.string().min(1).max(100),
  joinedAt: z.iso.datetime(),
  startingElo: elo.nullable(),
  baseline: elo.nullable(),
  current: elo.nullable(),
  target: elo.nullable(),
  crossedAt: z.iso.datetime().nullable(),
  disputed: z.boolean(),
});
export type RaceMember = z.infer<typeof memberSchema>;
export function raceProgress(
  history: readonly RatingEntry[],
  member: Pick<RaceMember, "joinedAt" | "startingElo">,
  goal: RaceGoal,
) {
  const firstPublished = history.find(
    (entry) => placementCount(entry) === null,
  );
  const baseline = member.startingElo ?? firstPublished?.after ?? null;
  const target =
    goal.kind === "milestone"
      ? goal.value
      : baseline === null
        ? null
        : baseline + goal.value;
  const latest = history.at(-1);
  const current =
    latest && placementCount(latest) === null ? latest.after : null;
  const crossedAt =
    baseline === null || target === null || target <= baseline
      ? null
      : (history.find(
          (entry) =>
            entry.completedAt > member.joinedAt &&
            (member.startingElo !== null ||
              (firstPublished &&
                entry !== firstPublished &&
                placementCount(entry) === null)) &&
            entry.before < target &&
            entry.after >= target,
        )?.completedAt ?? null);
  return { baseline, target, current, crossedAt };
}
export function firstCrossing(
  members: readonly Pick<RaceMember, "crossedAt" | "disputed">[],
) {
  if (members.some((member) => member.disputed)) return null;
  return members.reduce<string | null>(
    (first, member) =>
      member.crossedAt && (first === null || member.crossedAt < first)
        ? member.crossedAt
        : first,
    null,
  );
}
export function goalLabel(goal: RaceGoal) {
  return goal.kind === "gain"
    ? `Gain ${goal.value.toString()} Elo`
    : `Reach ${goal.value.toString()} Elo`;
}
export const winSchema = z.object({
  name: memberSchema.shape.name,
  fen: z.string().max(120),
  line: z
    .array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/))
    .min(1)
    .max(8),
  side: z.enum(["white", "black"]),
  race: raceId.nullable(),
  elo: elo.nullable(),
  raceElo: elo.nullable().default(null),
  target: elo.nullable(),
});
export type SharedWin = z.infer<typeof winSchema>;
