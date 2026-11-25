import { tutorGameMode } from "../game/types";
import type { ReviewTrainingLog } from "../analysis/review-training";
import type { LearningTheme, MoveAnalysisFact } from "../analysis/types";
import type { GameRecord, PlayerColor } from "../game/types";
import type {
  CurriculumEvidence,
  CurriculumTheme,
  TutorGameOutcome,
} from "./types";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const mapLearningTheme = (theme: LearningTheme): CurriculumTheme => {
  switch (theme) {
    case "premature-central-exchange":
      return "central-pawn-tension";
    case "hanging-piece":
    case "one-move-threat":
    case "king-safety":
    case "development":
    case "calculation":
    case "endgame-technique":
    case "other":
      return theme;
  }
};

export const mapAnalysisFactToEvidence = (
  fact: MoveAnalysisFact,
  completedAt: string,
  origin: CurriculumEvidence["origin"],
): CurriculumEvidence => {
  const weakness = fact.impactCp >= 50;
  const normalizedImpact = clamp(fact.impactCp / 300, 0.15, 1);
  const confidence = clamp(
    0.35 + fact.curricularRelevance / 200 + Math.min(fact.impactCp, 300) / 1000,
    0.35,
    0.9,
  );
  return {
    id: `${fact.gameId}:analysis:${fact.analysisVersion}:${String(fact.ply)}:${fact.theme}`,
    theme: mapLearningTheme(fact.theme),
    origin,
    outcome: weakness ? "weakness" : "success",
    impact: normalizedImpact,
    confidence,
    occurredAt: completedAt,
    phase: fact.phase,
    sourceGameId: fact.gameId,
  };
};

export const mapReviewLogToEvidence = (
  gameId: string,
  log: ReviewTrainingLog,
  origin: CurriculumEvidence["origin"],
  phase: CurriculumEvidence["phase"],
): CurriculumEvidence => {
  const score = clamp(log.firstAttemptScore, 0, 100);
  const success = score >= 80;
  return {
    id: `${gameId}:review:${log.theme}:${log.completedAt}`,
    theme: mapLearningTheme(log.theme),
    origin,
    outcome: success ? "success" : "weakness",
    impact: clamp(Math.abs(score - 50) / 50, 0.35, 1),
    confidence: clamp(0.6 + Math.abs(score - 50) / 125, 0.6, 1),
    occurredAt: log.completedAt,
    phase,
    sourceGameId: gameId,
  };
};

const resultScore = (
  result: NonNullable<GameRecord["result"]>,
  playerColor: PlayerColor,
): 0 | 0.5 | 1 => {
  if (result === "draw") return 0.5;
  const playerWon =
    (result === "white-win" && playerColor === "white") ||
    (result === "black-win" && playerColor === "black");
  return playerWon ? 1 : 0;
};

export const mapTutorGameOutcome = (
  game: GameRecord,
): TutorGameOutcome | null => {
  if (
    game.origin.type !== "tutor" ||
    tutorGameMode(game) === "coached" ||
    game.completedAt === null ||
    game.result === null ||
    game.playerColor === null
  ) {
    return null;
  }
  return {
    id: game.id,
    completedAt: game.completedAt,
    score: resultScore(game.result, game.playerColor),
  };
};
