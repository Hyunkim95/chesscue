import { Chess } from "chess.js";
import type { LearningTheme } from "../analysis/types";
import type { ObservedMove } from "./game-drill";

const unitForTheme: Record<LearningTheme, string> = {
  "hanging-piece": "count-captures",
  "one-move-threat": "see-the-threat",
  "premature-central-exchange": "pawn-breaks",
  "king-safety": "king-attack-plan",
  development: "develop-with-purpose",
  calculation: "calculate-replies",
  "endgame-technique": "choose-trades",
  other: "calculate-replies",
};

function unitForMove({ drill }: ObservedMove): string {
  if (drill.backRank) return "mating-patterns";
  if (drill.mateInOne) return "simple-mates";
  const { fen, theme } = drill.exercise;
  const board = new Chess(fen);
  if (board.isCheck()) return "get-out-of-check";
  if (theme === "endgame-technique") {
    const pieces = board
      .board()
      .flat()
      .flatMap((piece) => piece?.type ?? []);
    if (pieces.every((piece) => piece === "k" || piece === "p"))
      return "pawn-ending";
    if (
      pieces.every((piece) => piece === "k" || piece === "p" || piece === "r")
    )
      return "rook-ending";
  }
  return unitForTheme[theme];
}

export interface CurriculumRecommendation {
  readonly unitId: string;
  readonly games: number;
  readonly example: ObservedMove;
}

function compareExamples(left: ObservedMove, right: ObservedMove) {
  return (
    right.impactCp - left.impactCp ||
    right.drill.completedAt.localeCompare(left.drill.completedAt) ||
    left.game.id.localeCompare(right.game.id) ||
    left.ply - right.ply
  );
}

export function recommendCurriculumUnit(
  moves: readonly ObservedMove[],
): CurriculumRecommendation | null {
  const byUnit = new Map<
    string,
    { games: Set<string>; example: ObservedMove }
  >();
  for (const move of moves) {
    if (move.outcome !== "retry") continue;
    const id = unitForMove(move);
    const prior = byUnit.get(id);
    if (!prior) {
      byUnit.set(id, { games: new Set([move.game.id]), example: move });
      continue;
    }
    prior.games.add(move.game.id);
    if (compareExamples(move, prior.example) < 0) prior.example = move;
  }

  const [recommendation] = [...byUnit]
    .map(([unitId, { games, example }]) => ({
      unitId,
      games: games.size,
      example,
    }))
    .sort(
      (left, right) =>
        right.games - left.games ||
        compareExamples(left.example, right.example) ||
        left.unitId.localeCompare(right.unitId),
    );
  return recommendation ?? null;
}
