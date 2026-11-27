import type { AdaptiveLoopResult } from "../application/adaptive-loop";
import { recomputeAdaptiveLoop } from "../application/adaptive-loop";
import type { CompletedGameAnalysis } from "../application/analyze-game/analyze-completed-game";
import type {
  AnalysisRecord,
  AnalysisRepository,
} from "../application/ports/analysis-repository";
import type { GameRepository } from "../application/ports/game-repository";
import type {
  ReviewEvidenceRecord,
  ReviewEvidenceRepository,
} from "../application/ports/review-evidence-repository";
import type { ReviewTrainingLog } from "../domain/analysis/review-training";
import {
  mapAnalysisFactToEvidence,
  mapReviewLogToEvidence,
  type CurriculumEvidence,
} from "../domain/curriculum";
import type { GameRecord } from "../domain/game/types";
import { err, ok, type Result } from "../shared/result/result";
import { ANALYSIS_VERSION } from "./analysis-version";

export { ANALYSIS_VERSION };

export const completedAnalysisFromRecord = (
  record: AnalysisRecord,
): CompletedGameAnalysis => ({
  facts: record.facts,
  moments: record.moments,
  analyzedPlayerMoves: record.analyzedPlayerMoves,
});

const reviewLogValue = (record: ReviewEvidenceRecord): ReviewTrainingLog => ({
  subject: "chess",
  theme: record.theme,
  firstAttemptScore: record.firstAttemptScore,
  ...(record.originalAttemptScore === undefined
    ? {}
    : { originalAttemptScore: record.originalAttemptScore }),
  ...(record.closeTransferScore === undefined
    ? {}
    : { closeTransferScore: record.closeTransferScore }),
  ...(record.unlabeledTransferScore === undefined
    ? {}
    : { unlabeledTransferScore: record.unlabeledTransferScore }),
  hardSpot: record.hardSpot,
  dueReview: record.dueReview,
  nextGameReinforcement: record.reinforcement,
  transfer: record.transfer,
  completedAt: record.completedAt,
});

const latestAnalysisByGame = (
  records: readonly AnalysisRecord[],
): ReadonlyMap<string, AnalysisRecord> => {
  const selected = new Map<string, AnalysisRecord>();
  for (const record of records) {
    const current = selected.get(record.gameId);
    if (
      current === undefined ||
      current.analyzedAt.localeCompare(record.analyzedAt) < 0
    ) {
      selected.set(record.gameId, record);
    }
  }
  return selected;
};

const latestReviewByGame = (
  records: readonly ReviewEvidenceRecord[],
): ReadonlyMap<string, ReviewEvidenceRecord> => {
  const selected = new Map<string, ReviewEvidenceRecord>();
  for (const record of records) {
    const current = selected.get(record.gameId);
    if (
      current === undefined ||
      current.completedAt.localeCompare(record.completedAt) < 0
    ) {
      selected.set(record.gameId, record);
    }
  }
  return selected;
};

export const createAnalysisRecord = (input: {
  readonly game: GameRecord;
  readonly analysis: CompletedGameAnalysis;
  readonly analyzedAt: string;
}): AnalysisRecord => ({
  schemaVersion: 1,
  gameId: input.game.id,
  analysisVersion: ANALYSIS_VERSION,
  engineBuild: "stockfish-19-lite-single",
  searchSettings: { timeBudgetPerPositionMs: 120, multiPv: 3 },
  facts: input.analysis.facts,
  moments: input.analysis.moments,
  analyzedPlayerMoves: input.analysis.analyzedPlayerMoves,
  validationStatus: "validated",
  analyzedAt: input.analyzedAt,
});

export const createReviewEvidenceRecord = (input: {
  readonly gameId: string;
  readonly log: ReviewTrainingLog;
}): ReviewEvidenceRecord => ({
  schemaVersion: 1,
  id: `${input.gameId}:review:${input.log.theme}:${input.log.completedAt}`,
  gameId: input.gameId,
  analysisVersion: ANALYSIS_VERSION,
  theme: input.log.theme,
  firstAttemptScore: input.log.firstAttemptScore,
  ...(input.log.originalAttemptScore === undefined
    ? {}
    : { originalAttemptScore: input.log.originalAttemptScore }),
  ...(input.log.closeTransferScore === undefined
    ? {}
    : { closeTransferScore: input.log.closeTransferScore }),
  ...(input.log.unlabeledTransferScore === undefined
    ? {}
    : { unlabeledTransferScore: input.log.unlabeledTransferScore }),
  hardSpot: input.log.hardSpot,
  dueReview: input.log.dueReview,
  reinforcement: input.log.nextGameReinforcement,
  transfer: input.log.transfer,
  completedAt: input.log.completedAt,
});

export async function loadAdaptiveProfile(input: {
  readonly games: { listCompletedSources: GameRepository["listCompleted"] };
  readonly analyses: AnalysisRepository;
  readonly reviews: ReviewEvidenceRepository;
  readonly initialTargetElo: number;
  readonly curriculumVersion: string;
  readonly computedAt: string;
}): Promise<Result<AdaptiveLoopResult, string>> {
  const [gamesResult, analysesResult, reviewsResult] = await Promise.all([
    input.games.listCompletedSources(),
    input.analyses.listAll(),
    input.reviews.listAll(),
  ]);
  if (!gamesResult.ok) return err(gamesResult.error.message);
  if (!analysesResult.ok) return err(analysesResult.error.message);
  if (!reviewsResult.ok) return err(reviewsResult.error.message);

  const analysisByGame = latestAnalysisByGame(analysesResult.value);
  const reviewByGame = latestReviewByGame(reviewsResult.value);
  const completedTutorGames = gamesResult.value.flatMap((game) => {
    if (game.origin.type !== "tutor") return [];
    const analysis = analysisByGame.get(game.id);
    if (analysis === undefined) return [];
    const review = reviewByGame.get(game.id);
    return [
      {
        game,
        analysis: completedAnalysisFromRecord(analysis),
        reviewLog: review === undefined ? null : reviewLogValue(review),
      },
    ];
  });

  const importedEvidence: CurriculumEvidence[] = [];
  // Devices may import the same PGN under different immutable record IDs.
  // Count each position once and attribute review attempts to its canonical game.
  const imports = new Map<string, GameRecord[]>();
  for (const game of gamesResult.value) {
    if (game.origin.type === "tutor" || game.completedAt === null) continue;
    const key = game.fingerprint ?? game.id;
    const group = imports.get(key);
    if (group) group.push(game);
    else imports.set(key, [game]);
  }
  for (const group of imports.values()) {
    const canonical = group[0];
    if (!canonical?.completedAt) continue;
    const perspectives = group.filter(
      (game) => game.playerColor === canonical.playerColor,
    );
    const analysis = perspectives
      .map((game) => analysisByGame.get(game.id))
      .find((record) => record !== undefined);
    if (!analysis) continue;
    for (const fact of analysis.facts)
      importedEvidence.push(
        mapAnalysisFactToEvidence(
          { ...fact, gameId: canonical.id },
          canonical.completedAt,
          "import",
        ),
      );
    for (const game of perspectives) {
      const review = reviewByGame.get(game.id);
      if (!review) continue;
      const fact = analysis.facts.find((item) => item.theme === review.theme);
      if (fact)
        importedEvidence.push(
          mapReviewLogToEvidence(
            canonical.id,
            reviewLogValue(review),
            "import",
            fact.phase,
          ),
        );
    }
  }

  return ok(
    recomputeAdaptiveLoop({
      completedTutorGames,
      importedEvidence,
      initialTargetElo: input.initialTargetElo,
      curriculumVersion: input.curriculumVersion,
      computedAt: input.computedAt,
    }),
  );
}
