import { Chess } from "chess.js";
import { z } from "zod";

import type { PracticeExercise } from "../transfer/types";

// "Test yourself" after a missed tactic: one unseen puzzle with the same idea
// and one with a different idea, in an order the learner cannot predict. The
// learner is not told which is which, so solving the first one shows they can
// spot the idea rather than apply a named drill.

const uci = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

const puzzleSchema = z
  .object({
    id: z.string().min(1),
    unitId: z.string().min(1),
    fen: z.string().min(1),
    solution: z.array(uci).min(1),
    rating: z.number().int().positive(),
    source: z.url(),
  })
  .strict()
  .refine(({ fen, solution }) => {
    try {
      const board = new Chess(fen);
      for (const move of solution) board.move(move);
      return true;
    } catch {
      return false;
    }
  });

export const followUpPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.string().min(1),
    engine: z.string().min(1),
    puzzles: z.array(puzzleSchema).min(2),
  })
  .strict()
  .refine(
    ({ puzzles }) =>
      new Set(puzzles.map(({ id }) => id)).size === puzzles.length,
  );

export type FollowUpPack = z.infer<typeof followUpPackSchema>;
export type FollowUpPuzzle = FollowUpPack["puzzles"][number];

export interface FollowUpItem {
  readonly puzzle: FollowUpPuzzle;
  // Whether this puzzle tests the same idea as the missed tactic.
  readonly sameIdea: boolean;
}

// A stable pseudo-random order from a string seed.
function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function followUpSet(
  pack: FollowUpPack,
  unitId: string,
  seen: ReadonlySet<string>,
  seed: string,
): readonly FollowUpItem[] | undefined {
  const order = (puzzles: readonly FollowUpPuzzle[]) =>
    puzzles
      .filter(({ id }) => !seen.has(id))
      .toSorted((a, b) => hash(seed + a.id) - hash(seed + b.id));
  const [same] = order(pack.puzzles.filter((p) => p.unitId === unitId));
  const [other] = order(pack.puzzles.filter((p) => p.unitId !== unitId));
  if (!same || !other) return undefined;
  const items = [
    { puzzle: same, sameIdea: true },
    { puzzle: other, sameIdea: false },
  ];
  return hash(seed) % 2 === 0 ? items : items.toReversed();
}

export function followUpExercise(puzzle: FollowUpPuzzle): PracticeExercise {
  return {
    id: "follow-up-" + puzzle.id,
    // "other" keeps Practice from naming the idea before the learner moves.
    theme: "other",
    fen: puzzle.fen,
    acceptableMoves: puzzle.solution.slice(0, 1),
    explanation: "Stockfish checked this line.",
    verification: {
      candidates: [],
      toleranceCp: 0,
      principalVariation: puzzle.solution,
    },
  };
}

export interface FollowUpAttempt {
  readonly puzzleId: string;
  readonly unitId: string;
  readonly sameIdea: boolean;
  readonly solved: boolean;
  // Solved with the first move and no hint, preview or reveal.
  readonly unaided: boolean;
}

export function followUpAttempt(
  item: FollowUpItem,
  firstMove: string,
  helped: boolean,
): FollowUpAttempt {
  const solved = firstMove === item.puzzle.solution[0];
  return {
    puzzleId: item.puzzle.id,
    unitId: item.puzzle.unitId,
    sameIdea: item.sameIdea,
    solved,
    unaided: solved && !helped,
  };
}

// The leading indicator agreed on 27 November 2026: the share of explored
// ideas the learner then solves unaided in a same-idea follow-up.
export function identificationRate(attempts: readonly FollowUpAttempt[]): {
  readonly solved: number;
  readonly attempts: number;
} {
  const same = attempts.filter(({ sameIdea }) => sameIdea);
  return {
    solved: same.filter(({ unaided }) => unaided).length,
    attempts: same.length,
  };
}
