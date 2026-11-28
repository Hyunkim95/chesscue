import type { ObservedMove } from "../curriculum/game-drill";
import type { MomentAttemptRecord, StarState } from "../progress/types";
import { changesTheResult, isServableMoment } from "./moment-goal";

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
  // A plan position without one clearly best move is skipped, and so is a
  // miss that left the result unchanged.
  readonly moments: readonly ObservedMove[];
  // Chances the player took in real games (a tactic they played), offered
  // in a game's replay. They are never new here: one tried from a replay
  // and not spotted comes back like a missed moment.
  readonly chancesTaken?: readonly ObservedMove[];
  readonly attempts: readonly MomentAttemptRecord[];
  readonly puzzles: readonly { readonly id: string; readonly unitId: string }[];
  readonly stars: ReadonlyMap<string, StarState>;
  readonly now: Date;
  // Moments served even without one clearly best move, such as "Spot the
  // danger", where any safe move counts.
  readonly alwaysServe?: (moment: ObservedMove) => boolean;
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
  const moments = input.moments.toSorted(newestGameFirst);
  function servable(moment: ObservedMove): boolean {
    const { fen, verification } = moment.drill.exercise;
    const bestCp = Math.max(
      ...verification.candidates.map(({ evaluationCp }) => evaluationCp),
    );
    // A chance taken lost nothing in the game; its line is what counts.
    if (
      moment.outcome === "retry" &&
      !changesTheResult(bestCp, moment.impactCp)
    )
      return false;
    return (
      isServableMoment(
        fen,
        verification.principalVariation,
        verification.candidates,
      ) || input.alwaysServe?.(moment) === true
    );
  }
  const fresh = moments.find(
    (moment) =>
      !latest.has(momentKey(moment.game.id, moment.ply)) && servable(moment),
  );
  if (fresh) return { kind: "new", moment: fresh };
  const returning = [
    ...moments,
    ...(input.chancesTaken ?? []).toSorted(newestGameFirst),
  ].find((moment) => {
    const { game, ply } = moment;
    const last = latest.get(momentKey(game.id, ply));
    return (
      last !== undefined &&
      last.outcome !== "spotted" &&
      input.now.getTime() - Date.parse(last.completedAt) >= RETURN_AFTER_MS &&
      servable(moment)
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
