import type { CompletedGameAnalysis } from "../analyze-game/analyze-completed-game";
import type { ReviewTrainingLog } from "../../domain/analysis/review-training";
import { validateMoveAnalysisFact } from "../../domain/analysis/validate-fact";
import { buildPlayerProfile } from "../../domain/curriculum/build-profile";
import {
  mapAnalysisFactToEvidence,
  mapReviewLogToEvidence,
  mapTutorGameOutcome,
} from "../../domain/curriculum/evidence-mapping";
import type {
  CurriculumEvidence,
  EvidenceOrigin,
  PlayerProfile,
  TutorGameOutcome,
} from "../../domain/curriculum/types";
import type { GameRecord } from "../../domain/game/types";

export interface CompletedTutorGameInput {
  readonly game: GameRecord;
  readonly analysis: CompletedGameAnalysis;
  readonly reviewLog: ReviewTrainingLog | null;
}

export interface AdaptiveLoopIssue {
  readonly sourceId: string;
  readonly code:
    | "not-completed-tutor-game"
    | "analysis-count-mismatch"
    | "invalid-analysis-fact"
    | "analysis-game-mismatch"
    | "invalid-review-log"
    | "invalid-imported-evidence"
    | "conflicting-evidence";
  readonly message: string;
}

export interface RecomputeAdaptiveLoopInput {
  readonly completedTutorGames: readonly CompletedTutorGameInput[];
  readonly importedEvidence: readonly CurriculumEvidence[];
  readonly initialTargetElo: number;
  readonly curriculumVersion: string;
  readonly computedAt: string;
}

export interface AdaptiveLoopResult {
  readonly profile: PlayerProfile;
  readonly evidence: readonly CurriculumEvidence[];
  readonly tutorGameOutcomes: readonly TutorGameOutcome[];
  readonly contributingGames: Readonly<Record<EvidenceOrigin, number>>;
  readonly acceptedGameIds: readonly string[];
  readonly issues: readonly AdaptiveLoopIssue[];
}

const validDate = (value: string): boolean =>
  Number.isFinite(Date.parse(value));

const validImportedEvidence = (evidence: CurriculumEvidence): boolean =>
  evidence.origin === "import" &&
  evidence.id.length > 0 &&
  evidence.sourceGameId.length > 0 &&
  evidence.impact >= 0 &&
  evidence.impact <= 1 &&
  evidence.confidence >= 0 &&
  evidence.confidence <= 1 &&
  validDate(evidence.occurredAt);

const validateCompletedInput = (
  input: CompletedTutorGameInput,
): AdaptiveLoopIssue | null => {
  const { game, analysis, reviewLog } = input;
  if (
    game.origin.type !== "tutor" ||
    game.completedAt === null ||
    game.result === null ||
    game.playerColor === null
  ) {
    return {
      sourceId: game.id,
      code: "not-completed-tutor-game",
      message:
        "Only completed tutor games with a known learner color can update the adaptive loop.",
    };
  }
  if (analysis.analyzedPlayerMoves !== analysis.facts.length) {
    return {
      sourceId: game.id,
      code: "analysis-count-mismatch",
      message: "The completed analysis count does not match its fact records.",
    };
  }
  for (const fact of analysis.facts) {
    if (fact.gameId !== game.id) {
      return {
        sourceId: game.id,
        code: "analysis-game-mismatch",
        message: "An analysis fact belongs to a different game.",
      };
    }
    const validated = validateMoveAnalysisFact(fact);
    if (!validated.ok) {
      return {
        sourceId: game.id,
        code: "invalid-analysis-fact",
        message: validated.reason,
      };
    }
    const recordedMove = game.moves.find((move) => move.ply === fact.ply);
    const previousFen =
      fact.ply === 1
        ? game.initialFen
        : game.moves.find((move) => move.ply === fact.ply - 1)?.fenAfter;
    if (
      recordedMove?.uci !== fact.playedMoveUci ||
      previousFen !== fact.fenBefore
    ) {
      return {
        sourceId: game.id,
        code: "invalid-analysis-fact",
        message:
          "An analysis fact does not trace to the stored game move and position.",
      };
    }
  }
  if (
    reviewLog !== null &&
    (!validDate(reviewLog.completedAt) ||
      reviewLog.firstAttemptScore < 0 ||
      reviewLog.firstAttemptScore > 100 ||
      !analysis.facts.some((fact) => fact.theme === reviewLog.theme))
  ) {
    return {
      sourceId: game.id,
      code: "invalid-review-log",
      message:
        "The review log is not supported by this game's validated analysis.",
    };
  }
  return null;
};

const evidenceKey = (evidence: CurriculumEvidence): string =>
  [
    evidence.id,
    evidence.theme,
    evidence.origin,
    evidence.outcome,
    String(evidence.impact),
    String(evidence.confidence),
    evidence.occurredAt,
    evidence.phase,
    evidence.sourceGameId,
  ].join("|");

const deduplicateEvidence = (
  values: readonly CurriculumEvidence[],
): {
  readonly evidence: readonly CurriculumEvidence[];
  readonly issues: readonly AdaptiveLoopIssue[];
} => {
  const groups = new Map<string, CurriculumEvidence[]>();
  for (const evidence of values) {
    const group = groups.get(evidence.id) ?? [];
    group.push(evidence);
    groups.set(evidence.id, group);
  }
  const issues: AdaptiveLoopIssue[] = [];
  const evidence: CurriculumEvidence[] = [];
  for (const [id, group] of [...groups.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const ordered = group.toSorted((left, right) =>
      evidenceKey(left).localeCompare(evidenceKey(right)),
    );
    const selected = ordered[0];
    if (selected === undefined) continue;
    if (ordered.some((item) => evidenceKey(item) !== evidenceKey(selected))) {
      issues.push({
        sourceId: id,
        code: "conflicting-evidence",
        message:
          "Conflicting records shared one evidence ID; the deterministic canonical record was used.",
      });
    }
    evidence.push(selected);
  }
  return { evidence, issues };
};

const deduplicateTutorOutcomes = (
  values: readonly TutorGameOutcome[],
): readonly TutorGameOutcome[] => {
  const byId = new Map<string, TutorGameOutcome>();
  for (const value of values.toSorted((left, right) => {
    const idDifference = left.id.localeCompare(right.id);
    if (idDifference !== 0) return idDifference;
    const dateDifference = left.completedAt.localeCompare(right.completedAt);
    return dateDifference === 0 ? left.score - right.score : dateDifference;
  })) {
    if (!byId.has(value.id)) byId.set(value.id, value);
  }
  return [...byId.values()];
};

export const recomputeAdaptiveLoop = (
  input: RecomputeAdaptiveLoopInput,
): AdaptiveLoopResult => {
  const issues: AdaptiveLoopIssue[] = [];
  const emittedEvidence: CurriculumEvidence[] = [];
  const tutorOutcomes: TutorGameOutcome[] = [];
  const acceptedGameIds: string[] = [];

  for (const imported of input.importedEvidence) {
    if (validImportedEvidence(imported)) emittedEvidence.push(imported);
    else {
      issues.push({
        sourceId: imported.id,
        code: "invalid-imported-evidence",
        message:
          "Imported evidence failed its local bounds or provenance checks.",
      });
    }
  }

  const orderedGames = input.completedTutorGames.toSorted((left, right) =>
    left.game.id.localeCompare(right.game.id),
  );
  const acceptedGameSet = new Set<string>();
  for (const completed of orderedGames) {
    const validationIssue = validateCompletedInput(completed);
    if (validationIssue !== null) {
      issues.push(validationIssue);
      continue;
    }
    const completedAt = completed.game.completedAt;
    if (completedAt === null) continue;
    if (!acceptedGameSet.has(completed.game.id)) {
      acceptedGameSet.add(completed.game.id);
      acceptedGameIds.push(completed.game.id);
      const outcome = mapTutorGameOutcome(completed.game);
      if (outcome !== null) tutorOutcomes.push(outcome);
    }
    for (const fact of completed.analysis.facts) {
      emittedEvidence.push(
        mapAnalysisFactToEvidence(fact, completedAt, "tutor"),
      );
    }
    if (completed.reviewLog !== null) {
      const matchingFact = completed.analysis.facts.find(
        (fact) => fact.theme === completed.reviewLog?.theme,
      );
      if (matchingFact !== undefined) {
        emittedEvidence.push(
          mapReviewLogToEvidence(
            completed.game.id,
            completed.reviewLog,
            "tutor",
            matchingFact.phase,
          ),
        );
      }
    }
  }

  const deduplicatedEvidence = deduplicateEvidence(emittedEvidence);
  issues.push(...deduplicatedEvidence.issues);
  const tutorGameOutcomes = deduplicateTutorOutcomes(tutorOutcomes);
  const evidence = deduplicatedEvidence.evidence;
  const sources = { import: new Set<string>(), tutor: new Set<string>() };
  for (const item of evidence) sources[item.origin].add(item.sourceGameId);
  const profile = buildPlayerProfile({
    initialTargetElo: input.initialTargetElo,
    curriculumVersion: input.curriculumVersion,
    computedAt: input.computedAt,
    evidence,
    tutorGames: tutorGameOutcomes,
  });

  return {
    profile,
    evidence,
    tutorGameOutcomes,
    contributingGames: {
      import: sources.import.size,
      tutor: sources.tutor.size,
    },
    acceptedGameIds: acceptedGameIds.toSorted(),
    issues: issues.toSorted((left, right) => {
      const sourceDifference = left.sourceId.localeCompare(right.sourceId);
      return sourceDifference === 0
        ? left.code.localeCompare(right.code)
        : sourceDifference;
    }),
  };
};
