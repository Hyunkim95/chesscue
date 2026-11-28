import { isTacticLine } from "../analysis/explain-miss";
import type { ObservedMove } from "../curriculum/game-drill";
import { readGoodMove } from "../curriculum/good-moves";
import { unitForDrill } from "../curriculum/recommend-unit";

// What a real game says about one idea: the player missed it, or played it
// unaided on a tactic line (ENGINEERING.md §17.4) or as one of the things they
// did well (a tactic, a threat dealt with, the only move; GOOD_MOVES_VERSION).
// Shared by star states and the idea collection so both read games the same
// way.
export interface GameIdeaEvidence {
  readonly unitId: string;
  readonly gameId: string;
  readonly ply: number;
  readonly outcome: "missed" | "played";
  // ISO 8601 timestamp of the game's completion.
  readonly completedAt: string;
}

// A threat dealt with trains seeing the threat, whatever the best line's
// own idea is.
const THREAT_UNIT = "see-the-threat";

function playedUnit(observed: ObservedMove): string | undefined {
  const { drill } = observed;
  if (
    isTacticLine(
      drill.exercise.fen,
      drill.exercise.verification.principalVariation,
    )
  )
    return unitForDrill(drill);
  const good = readGoodMove(observed);
  if (!good) return undefined;
  return good.kind === "threat" ? THREAT_UNIT : unitForDrill(drill);
}

// Stars, the idea collection and the star sheet share each immutable snapshot.
const evidenceBySnapshot = new WeakMap<
  readonly ObservedMove[],
  readonly GameIdeaEvidence[]
>();

export function gameIdeaEvidence(
  games: readonly ObservedMove[],
): readonly GameIdeaEvidence[] {
  const cached = evidenceBySnapshot.get(games);
  if (cached !== undefined) return cached;

  const evidence = games.flatMap<GameIdeaEvidence>((observed) => {
    const { game, ply, outcome, drill } = observed;
    const unitId =
      outcome === "matched" ? playedUnit(observed) : unitForDrill(drill);
    if (unitId === undefined) return [];
    return [
      {
        unitId,
        gameId: game.id,
        ply,
        outcome: outcome === "matched" ? "played" : "missed",
        completedAt: drill.completedAt,
      },
    ];
  });
  evidenceBySnapshot.set(games, evidence);
  return evidence;
}
