import type { ObservedMove } from "../curriculum/game-drill";
import type { MomentAttemptRecord, StarState } from "../progress/types";
import { isServableMoment } from "./moment-goal";

// Today's position (design §3.1): a new moment from the player's games; else
// a missed moment coming back; else a checked puzzle like the player's
// misses. Never labelled with its idea.
export type TodayPick =
  | { readonly kind: "new"; readonly moment: ObservedMove }
  | { readonly kind: "returning"; readonly moment: ObservedMove }
  | { readonly kind: "similar"; readonly puzzleId: string }
  | { readonly kind: "warm-up" }
  | { readonly kind: "caught-up" };

export interface TodayInput {
  // Moments from analysed real games, where the player missed a better move.
  // A plan position without one clearly best move is skipped.
  readonly moments: readonly ObservedMove[];
  readonly attempts: readonly MomentAttemptRecord[];
  readonly puzzles: readonly { readonly id: string; readonly unitId: string }[];
  readonly stars: ReadonlyMap<string, StarState>;
  readonly now: Date;
}

// A missed moment comes back after this long.
export const RETURN_AFTER_MS = 20 * 60 * 60 * 1000;

export function momentKey(gameId: string, ply: number): string {
  return `${gameId}:${String(ply)}`;
}

function attemptKey({ source }: MomentAttemptRecord): string {
  return source.kind === "game"
    ? momentKey(source.gameId, source.ply)
    : `puzzle:${source.puzzleId}`;
}

const newestGameFirst = (a: ObservedMove, b: ObservedMove) =>
  Date.parse(b.drill.completedAt) - Date.parse(a.drill.completedAt) ||
  a.ply - b.ply;

export function pickToday(input: TodayInput): TodayPick {
  const latest = new Map<string, MomentAttemptRecord>();
  for (const attempt of input.attempts) {
    const key = attemptKey(attempt);
    const previous = latest.get(key);
    if (
      !previous ||
      Date.parse(attempt.completedAt) >= Date.parse(previous.completedAt)
    )
      latest.set(key, attempt);
  }
  const moments = input.moments
    .filter(({ drill: { exercise } }) =>
      isServableMoment(
        exercise.fen,
        exercise.verification.principalVariation,
        exercise.verification.candidates,
      ),
    )
    .sort(newestGameFirst);
  const fresh = moments.find(
    ({ game, ply }) => !latest.has(momentKey(game.id, ply)),
  );
  if (fresh) return { kind: "new", moment: fresh };
  const returning = moments.find(({ game, ply }) => {
    const last = latest.get(momentKey(game.id, ply));
    return (
      last !== undefined &&
      last.outcome !== "spotted" &&
      input.now.getTime() - Date.parse(last.completedAt) >= RETURN_AFTER_MS
    );
  });
  if (returning) return { kind: "returning", moment: returning };
  const missedUnits = new Set(
    [...input.stars]
      .filter(([, state]) => state === "missed")
      .map(([unit]) => unit),
  );
  const similar = input.puzzles.find(
    ({ id, unitId }) => missedUnits.has(unitId) && !latest.has(`puzzle:${id}`),
  );
  if (similar) return { kind: "similar", puzzleId: similar.id };
  return input.moments.length === 0 && input.attempts.length === 0
    ? { kind: "warm-up" }
    : { kind: "caught-up" };
}
