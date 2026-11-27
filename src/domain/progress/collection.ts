// Workstream 3 implements this. The signature is part of the frozen
// contract so deriveProgress (workstream 2) can call it.
import type { ObservedMove } from "../curriculum/game-drill";
import type { IdeaCard, MomentAttemptRecord, StarState } from "./types";

export interface CollectionInput {
  readonly attempts: readonly MomentAttemptRecord[];
  readonly games: readonly ObservedMove[];
  readonly stars: ReadonlyMap<string, StarState>;
}

// One card per unit with a spotted or shining star.
export const ideaCollection: (
  input: CollectionInput,
) => readonly IdeaCard[] = () => [];
