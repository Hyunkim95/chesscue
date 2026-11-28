import type { MomentAttemptRecord, StarState } from "../progress/types";

// "Puzzles for you" under Today's position (owner approval, 28 November
// 2026): unseen pack puzzles from the units the player missed, easiest
// first, then the easiest other unseen puzzles. Never today's own position.
// Like Today, a puzzle is never labelled with its idea.
export const RECOMMENDED_PUZZLES = 3;

export interface RecommendablePuzzle {
  readonly id: string;
  readonly unitId: string;
  readonly rating: number;
}

export function recommendedPuzzles<P extends RecommendablePuzzle>({
  puzzles,
  attempts,
  stars,
  exclude,
  count = RECOMMENDED_PUZZLES,
}: {
  readonly puzzles: readonly P[];
  readonly attempts: readonly MomentAttemptRecord[];
  readonly stars: ReadonlyMap<string, StarState>;
  // Today's own position, when it is a puzzle.
  readonly exclude?: string | undefined;
  readonly count?: number;
}): P[] {
  const seen = new Set(
    attempts.flatMap(({ source }) =>
      source.kind === "puzzle" ? [source.puzzleId] : [],
    ),
  );
  const missed = new Set(
    [...stars].filter(([, state]) => state === "missed").map(([unit]) => unit),
  );
  return puzzles
    .filter(({ id }) => id !== exclude && !seen.has(id))
    .toSorted(
      (a, b) =>
        Number(missed.has(b.unitId)) - Number(missed.has(a.unitId)) ||
        a.rating - b.rating ||
        a.id.localeCompare(b.id),
    )
    .slice(0, count);
}
