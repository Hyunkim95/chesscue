import { Chess } from "chess.js";
import { isTacticLine } from "../analysis/explain-miss";
import { lineEvidence } from "../analysis/line-evidence";
import type { LearningTheme } from "../analysis/types";
import { installedUnitClassifier } from "./installed-unit-classifier";
import { confidentUnit } from "./unit-classifier";
import { MINIMUM_BOARD_UNIT_PROBABILITY } from "./board-unit-model";
import type { PracticeExercise } from "../transfer/types";
import type { ObservedMove, VerifiedGameDrill } from "./game-drill";

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

export function unitForDrill(drill: VerifiedGameDrill): string {
  if (drill.backRank) return "mating-patterns";
  if (drill.mateInOne) return "simple-mates";
  const fallback = unitForExercise(drill.exercise);
  if (fallback === "get-out-of-check") return fallback;
  const { fen, verification } = drill.exercise;
  // When the better line is a tactic, a confident board-model prediction
  // names it and outranks the played-move theme. A quiet better line, such as
  // a defence against a threat, keeps the theme. Without a model prediction,
  // the classifier over the line's board facts decides.
  if (
    drill.predictedUnit &&
    drill.predictedUnit.probability >= MINIMUM_BOARD_UNIT_PROBABILITY &&
    isTacticLine(fen, verification.principalVariation)
  )
    return drill.predictedUnit.unitId;
  const evidence = lineEvidence(fen, verification.principalVariation);
  const predicted = evidence.ok
    ? confidentUnit(evidence.facts, installedUnitClassifier)
    : undefined;
  return predicted?.unitId ?? fallback;
}

export function unitForExercise({
  fen,
  theme,
}: Pick<PracticeExercise, "fen" | "theme">): string {
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

export function unitForPosition(
  exercise: Pick<PracticeExercise, "fen" | "theme">,
  moves: readonly ObservedMove[],
  sourceGameId?: string,
) {
  const source = moves.find(
    ({ game, drill }) =>
      game.id === sourceGameId && drill.exercise.fen === exercise.fen,
  );
  return source ? unitForDrill(source.drill) : unitForExercise(exercise);
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
    const id = unitForDrill(move.drill);
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
