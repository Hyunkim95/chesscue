import type { GameRecord } from "../game/types";
import { fingerprintCanonicalGame } from "../import/fingerprint";
import type { ObservedMove } from "./game-drill";
import type { LearningTheme } from "../analysis/types";

export function snapshotGames(records: readonly GameRecord[]): GameRecord[] {
  const eligible = records.filter(
    (g) =>
      g.completedAt !== null && g.result !== null && g.playerColor !== null,
  );
  if (!eligible.some((game) => game.origin.type !== "tutor")) return eligible;
  const fingerprint = (game: GameRecord) =>
    game.fingerprint ??
    fingerprintCanonicalGame(
      game.initialFen,
      game.moves.map((m) => m.uci),
    );
  // Prefer actual tutor records when one is reimported. Two independently
  // played tutor games still count even if their moves happen to coincide.
  const seen = new Set(
    eligible.filter((g) => g.origin.type === "tutor").map(fingerprint),
  );
  return eligible.filter((game) => {
    if (game.origin.type === "tutor") return true;
    const key = fingerprint(game);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type PatternKey = LearningTheme | "back-rank";
export const patternNames: Record<PatternKey, string> = {
  "back-rank": "back-rank mates",
  "hanging-piece": "piece safety",
  "one-move-threat": "one-move threats",
  "premature-central-exchange": "central pawn tension",
  "king-safety": "king safety",
  development: "piece development",
  calculation: "calculation",
  "endgame-technique": "endgame technique",
  other: "critical decisions",
};
export interface MovePattern {
  key: PatternKey;
  name: string;
  moves: ObservedMove[];
  games: number;
}
function groupMoves(
  moves: readonly ObservedMove[],
  outcome: ObservedMove["outcome"],
): MovePattern[] {
  const groups = new Map<PatternKey, ObservedMove[]>();
  for (const move of moves) {
    if (move.outcome !== outcome) continue;
    const key = move.drill.backRank ? "back-rank" : move.drill.exercise.theme;
    const group = groups.get(key);
    if (group) group.push(move);
    else groups.set(key, [move]);
  }
  return [...groups]
    .map(([key, examples]) => {
      const ordered = examples.toSorted(
        (a, b) =>
          b.drill.completedAt.localeCompare(a.drill.completedAt) ||
          b.impactCp - a.impactCp ||
          a.game.id.localeCompare(b.game.id) ||
          a.ply - b.ply,
      );
      return {
        key,
        name: patternNames[key],
        moves: ordered,
        games: new Set(ordered.map((item) => item.game.id)).size,
      };
    })
    .sort(
      (a, b) =>
        b.games - a.games ||
        b.moves.length - a.moves.length ||
        (b.moves[0]?.drill.completedAt ?? "").localeCompare(
          a.moves[0]?.drill.completedAt ?? "",
        ) ||
        a.key.localeCompare(b.key),
    );
}
export function buildPlayingSnapshot(moves: readonly ObservedMove[]) {
  // Count a position once even if two versions of its analysis are supplied.
  const seen = new Set<string>();
  const unique = moves.filter((m) => {
    const id = JSON.stringify([m.game.id, m.ply]);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const retries = groupMoves(unique, "retry"),
    repeated = retries.filter((p) => p.games > 1);
  return {
    practice: repeated.length ? repeated.slice(0, 3) : retries.slice(0, 1),
    strengths: groupMoves(unique, "matched").slice(0, 2),
  };
}
