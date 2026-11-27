import { gameIdeaEvidence } from "./game-evidence";
import type { ProgressInput, StarState } from "./types";

type StarTimes = Partial<Record<Exclude<StarState, "not-seen">, number>>;

export function starEvidence({ attempts, games }: ProgressInput) {
  const byUnit = new Map<string, StarTimes>();

  function record(
    unitId: string,
    state: keyof StarTimes,
    completedAt: string,
  ): void {
    const times = byUnit.get(unitId) ?? {};
    const instant = Date.parse(completedAt);
    times[state] = Math.min(times[state] ?? Infinity, instant);
    byUnit.set(unitId, times);
  }

  for (const { unitId, outcome, completedAt } of attempts) {
    if (unitId === undefined) continue;
    record(unitId, outcome === "spotted" ? "spotted" : "missed", completedAt);
  }
  for (const { unitId, outcome, completedAt } of gameIdeaEvidence(games)) {
    record(unitId, outcome === "played" ? "shining" : "missed", completedAt);
  }

  return [...byUnit.entries()].sort(([first], [second]) =>
    first < second ? -1 : first > second ? 1 : 0,
  );
}

export function deriveStars(input: ProgressInput) {
  const stars = new Map<string, StarState>();
  let newestStar: string | undefined;
  let newestTime = -Infinity;

  for (const [unitId, { shining, spotted, missed }] of starEvidence(input)) {
    const reachedAt = shining ?? spotted ?? missed;
    if (reachedAt === undefined) continue;

    stars.set(
      unitId,
      shining !== undefined
        ? "shining"
        : spotted !== undefined
          ? "spotted"
          : "missed",
    );
    if (reachedAt > newestTime) {
      newestTime = reachedAt;
      newestStar = unitId;
    }
  }

  return { stars, newestStar };
}
