import { readGoodMove } from "../curriculum/good-moves";
import type { ObservedMove } from "../curriculum/game-drill";

// Watching a past game (owner decision, 28 November 2026): the replay stops
// at the player's moments. A win is a tactic the player played that mates or
// wins material once the exchanges settle; a miss is one of the game's
// checked turning points, where something stronger was there.
export type WatchMarkerKind = "win" | "miss";

export interface WatchMarker {
  readonly ply: number;
  readonly kind: WatchMarkerKind;
  // The move the player made there, for example "Nc7+".
  readonly san: string;
  // "Move 10", the player's move number.
  readonly moveLabel: string;
}

// At most this many wins are marked per game, strongest first, so a long
// game of small captures does not stop every few moves.
export const WATCH_WINS = 3;

export function watchMarkers(
  observed: readonly ObservedMove[],
  turningPoints: readonly { readonly ply: number }[],
): readonly WatchMarker[] {
  const turning = new Set(turningPoints.map(({ ply }) => ply));
  const wins = observed
    .flatMap((move) => {
      const good = readGoodMove(move);
      return good?.kind === "tactic" ? [good] : [];
    })
    .slice(0, WATCH_WINS)
    .map(
      ({ ply, san, moveLabel }): WatchMarker => ({
        ply,
        kind: "win",
        san,
        moveLabel,
      }),
    );
  const misses = observed.flatMap((move): WatchMarker[] => {
    if (move.outcome !== "retry" || !turning.has(move.ply)) return [];
    const played = move.game.moves.find(({ ply }) => ply === move.ply);
    return played
      ? [
          {
            ply: move.ply,
            kind: "miss",
            san: played.san,
            moveLabel: move.drill.moveLabel,
          },
        ]
      : [];
  });
  return [...wins, ...misses].toSorted((a, b) => a.ply - b.ply);
}

// The one caption line for a move as the replay plays it.
export function watchCaption({
  san,
  byPlayer,
  opponent,
}: {
  readonly san: string;
  readonly byPlayer: boolean;
  readonly opponent: string | undefined;
}): string {
  return byPlayer
    ? `You play ${san}.`
    : `${opponent ?? "Your opponent"} plays ${san}.`;
}

// What Rook says when the replay stops at a marker. A win is never named
// before the player finds it again.
export function watchStop({
  marker,
  previousSan,
  opponent,
}: {
  readonly marker: WatchMarker;
  readonly previousSan: string | undefined;
  readonly opponent: string | undefined;
}): string {
  if (marker.kind === "miss")
    return `You played ${marker.san}. Something stronger was here.`;
  return previousSan === undefined
    ? "Is there something here?"
    : `${opponent ?? "Your opponent"} played ${previousSan}. Is there something here?`;
}
