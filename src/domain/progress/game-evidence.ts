import { isTacticLine } from "../analysis/explain-miss";
import type { ObservedMove } from "../curriculum/game-drill";
import { unitForDrill } from "../curriculum/recommend-unit";

// What a real game says about one idea: the player missed it, or played it
// unaided on a tactic line (ENGINEERING.md §17.4). Shared by star states and
// the idea collection so both read games the same way.
export interface GameIdeaEvidence {
  readonly unitId: string;
  readonly gameId: string;
  readonly ply: number;
  readonly outcome: "missed" | "played";
  // ISO 8601 timestamp of the game's completion.
  readonly completedAt: string;
}

export function gameIdeaEvidence(
  games: readonly ObservedMove[],
): readonly GameIdeaEvidence[] {
  return games.flatMap(({ game, ply, outcome, drill }) => {
    if (
      outcome === "matched" &&
      !isTacticLine(
        drill.exercise.fen,
        drill.exercise.verification.principalVariation,
      )
    )
      return [];
    return [
      {
        unitId: unitForDrill(drill),
        gameId: game.id,
        ply,
        outcome: outcome === "matched" ? "played" : "missed",
        completedAt: drill.completedAt,
      },
    ];
  });
}
