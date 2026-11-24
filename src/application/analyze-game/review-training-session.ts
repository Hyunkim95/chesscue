import {
  buildReviewTrainingLog,
  scoreMoveAttempt,
  scoreTransferAttempt,
  type MoveAttemptScore,
  type ReviewTrainingLog,
} from "../../domain/analysis/review-training";
import type {
  LearningMoment,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import {
  transferExercisesForTheme,
  type CuratedTransferExercise,
} from "../../domain/transfer";
import type { CompletedGameAnalysis } from "./analyze-completed-game";

interface ReviewTrainingBase {
  readonly primaryFact: MoveAnalysisFact;
  readonly primaryMoment: LearningMoment;
  readonly closeExercise: CuratedTransferExercise | null;
  readonly unlabeledExercise: CuratedTransferExercise | null;
  readonly originalScore: MoveAttemptScore | null;
  readonly closeScore: MoveAttemptScore | null;
  readonly unlabeledScore: MoveAttemptScore | null;
}

export type ReviewTrainingState =
  | (ReviewTrainingBase & {
      readonly stage: "original-move";
      readonly log: null;
    })
  | (ReviewTrainingBase & {
      readonly stage: "original-feedback";
      readonly log: null;
    })
  | (ReviewTrainingBase & { readonly stage: "close-move"; readonly log: null })
  | (ReviewTrainingBase & {
      readonly stage: "close-feedback";
      readonly log: null;
    })
  | (ReviewTrainingBase & {
      readonly stage: "unlabeled-move";
      readonly log: null;
    })
  | (ReviewTrainingBase & {
      readonly stage: "unlabeled-feedback";
      readonly log: null;
    })
  | (ReviewTrainingBase & {
      readonly stage: "complete";
      readonly log: ReviewTrainingLog;
    });

export const startReviewTraining = (
  analysis: CompletedGameAnalysis,
  momentIndex = 0,
): ReviewTrainingState | null => {
  const primaryMoment = analysis.moments[momentIndex];
  if (primaryMoment === undefined) return null;
  const primaryFact = analysis.facts.find(
    (fact) =>
      fact.gameId === primaryMoment.gameId && fact.ply === primaryMoment.ply,
  );
  if (primaryFact === undefined) return null;
  const transferExercises = transferExercisesForTheme(primaryFact.theme);
  const closeExercise =
    transferExercises.find((exercise) => exercise.difficulty === "close") ??
    null;
  const unlabeledExercise =
    transferExercises.find((exercise) => exercise.difficulty === "unlabeled") ??
    null;
  const completePack = closeExercise !== null && unlabeledExercise !== null;

  return {
    stage: "original-move",
    primaryFact,
    primaryMoment,
    closeExercise: completePack ? closeExercise : null,
    unlabeledExercise: completePack ? unlabeledExercise : null,
    originalScore: null,
    closeScore: null,
    unlabeledScore: null,
    log: null,
  };
};

export const commitOriginalMove = (
  state: ReviewTrainingState,
  moveUci: string,
): ReviewTrainingState =>
  state.stage === "original-move"
    ? {
        ...state,
        stage: "original-feedback",
        originalScore: scoreMoveAttempt(state.primaryFact, moveUci),
      }
    : state;

const complete = (
  state: Exclude<ReviewTrainingState, { readonly stage: "complete" }>,
  completedAt: string,
): ReviewTrainingState => {
  if (state.originalScore === null) return state;
  return {
    ...state,
    stage: "complete",
    log: buildReviewTrainingLog({
      theme: state.primaryFact.theme,
      originalMoveAccepted: state.originalScore.accepted,
      closeMoveAccepted: state.closeScore?.accepted ?? null,
      unlabeledMoveAccepted: state.unlabeledScore?.accepted ?? null,
      completedAt,
    }),
  };
};

export const continueAfterOriginalFeedback = (
  state: ReviewTrainingState,
  completedAt: string,
): ReviewTrainingState => {
  if (state.stage !== "original-feedback") return state;
  return state.closeExercise === null || state.unlabeledExercise === null
    ? complete(state, completedAt)
    : { ...state, stage: "close-move" };
};

export const commitCloseMove = (
  state: ReviewTrainingState,
  moveUci: string,
): ReviewTrainingState =>
  state.stage === "close-move" && state.closeExercise !== null
    ? {
        ...state,
        stage: "close-feedback",
        closeScore: scoreTransferAttempt(state.closeExercise, moveUci),
      }
    : state;

export const continueAfterCloseFeedback = (
  state: ReviewTrainingState,
): ReviewTrainingState =>
  state.stage === "close-feedback" && state.unlabeledExercise !== null
    ? { ...state, stage: "unlabeled-move" }
    : state;

export const commitUnlabeledMove = (
  state: ReviewTrainingState,
  moveUci: string,
): ReviewTrainingState =>
  state.stage === "unlabeled-move" && state.unlabeledExercise !== null
    ? {
        ...state,
        stage: "unlabeled-feedback",
        unlabeledScore: scoreTransferAttempt(state.unlabeledExercise, moveUci),
      }
    : state;

export const completeAfterUnlabeled = (
  state: ReviewTrainingState,
  completedAt: string,
): ReviewTrainingState =>
  state.stage === "unlabeled-feedback" ? complete(state, completedAt) : state;
