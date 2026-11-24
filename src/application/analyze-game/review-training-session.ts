import {
  buildReviewTrainingLog,
  buildThemeChoices,
  scoreMoveAttempt,
  scoreThemeRetrieval,
  selectTransferFact,
  type MoveAttemptScore,
  type ReviewTrainingLog,
  type ThemeChoice,
} from "../../domain/analysis/review-training";
import type {
  LearningMoment,
  LearningTheme,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import type { CompletedGameAnalysis } from "./analyze-completed-game";

interface ReviewTrainingBase {
  readonly primaryFact: MoveAnalysisFact;
  readonly primaryMoment: LearningMoment;
  readonly transferFact: MoveAnalysisFact | null;
  readonly themeChoices: readonly ThemeChoice[];
  readonly themeChoice: LearningTheme | null;
  readonly themeCorrect: boolean | null;
  readonly primaryScore: MoveAttemptScore | null;
  readonly transferScore: MoveAttemptScore | null;
}

export type ReviewTrainingState =
  | (ReviewTrainingBase & {
      readonly stage: "theme-retrieval";
      readonly log: null;
    })
  | (ReviewTrainingBase & {
      readonly stage: "primary-move";
      readonly log: null;
    })
  | (ReviewTrainingBase & {
      readonly stage: "primary-feedback";
      readonly log: null;
    })
  | (ReviewTrainingBase & {
      readonly stage: "transfer-move";
      readonly log: null;
    })
  | (ReviewTrainingBase & {
      readonly stage: "transfer-feedback";
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

  return {
    stage: "theme-retrieval",
    primaryFact,
    primaryMoment,
    transferFact: selectTransferFact(analysis.facts, primaryFact),
    themeChoices: buildThemeChoices(primaryFact.theme),
    themeChoice: null,
    themeCorrect: null,
    primaryScore: null,
    transferScore: null,
    log: null,
  };
};

export const commitThemeRetrieval = (
  state: ReviewTrainingState,
  theme: LearningTheme,
): ReviewTrainingState => {
  if (state.stage !== "theme-retrieval") return state;
  return {
    ...state,
    stage: "primary-move",
    themeChoice: theme,
    themeCorrect: scoreThemeRetrieval(theme, state.primaryFact.theme),
  };
};

export const commitPrimaryMove = (
  state: ReviewTrainingState,
  moveUci: string,
): ReviewTrainingState => {
  if (state.stage !== "primary-move") return state;
  return {
    ...state,
    stage: "primary-feedback",
    primaryScore: scoreMoveAttempt(state.primaryFact, moveUci),
  };
};

const complete = (
  state: Exclude<ReviewTrainingState, { readonly stage: "complete" }>,
  completedAt: string,
): ReviewTrainingState => {
  if (state.themeCorrect === null || state.primaryScore === null) return state;
  return {
    ...state,
    stage: "complete",
    log: buildReviewTrainingLog({
      theme: state.primaryFact.theme,
      themeCorrect: state.themeCorrect,
      primaryMoveAccepted: state.primaryScore.accepted,
      transferMoveAccepted: state.transferScore?.accepted ?? null,
      completedAt,
    }),
  };
};

export const continueAfterPrimaryFeedback = (
  state: ReviewTrainingState,
  completedAt: string,
): ReviewTrainingState => {
  if (state.stage !== "primary-feedback") return state;
  return state.transferFact === null
    ? complete(state, completedAt)
    : { ...state, stage: "transfer-move" };
};

export const commitTransferMove = (
  state: ReviewTrainingState,
  moveUci: string,
): ReviewTrainingState => {
  if (state.stage !== "transfer-move" || state.transferFact === null)
    return state;
  return {
    ...state,
    stage: "transfer-feedback",
    transferScore: scoreMoveAttempt(state.transferFact, moveUci),
  };
};

export const completeAfterTransfer = (
  state: ReviewTrainingState,
  completedAt: string,
): ReviewTrainingState =>
  state.stage === "transfer-feedback" ? complete(state, completedAt) : state;
