import type { ObservedMove } from "../curriculum/game-drill";
import { gameIdeaEvidence } from "./game-evidence";
import type { IdeaCard, MomentAttemptRecord, StarState } from "./types";

export interface CollectionInput {
  readonly attempts: readonly MomentAttemptRecord[];
  readonly games: readonly ObservedMove[];
  readonly stars: ReadonlyMap<string, StarState>;
}

// One card per unit with a spotted or shining star.
export function ideaCollection(input: CollectionInput): readonly IdeaCard[] {
  const plays = new Map<string, number>();
  for (const { unitId, outcome } of gameIdeaEvidence(input.games)) {
    if (outcome === "played") plays.set(unitId, (plays.get(unitId) ?? 0) + 1);
  }
  return [...input.stars]
    .flatMap(([unitId, state]): IdeaCard[] => {
      if (state === "spotted") return [{ unitId, level: 1 }];
      if (state !== "shining") return [];
      // The first real-game play made it shine; each further one adds a level.
      const furtherPlays = Math.max(0, (plays.get(unitId) ?? 0) - 1);
      return [{ unitId, level: 2 + furtherPlays }];
    })
    .sort((a, b) => a.unitId.localeCompare(b.unitId));
}
