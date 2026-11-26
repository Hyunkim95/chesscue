import { cachedReflection } from "../material/reflection";
import { Chess, type Square } from "chess.js";

import type { PracticeExercise } from "../transfer/types";
import type { LearningTheme, MoveAnalysisFact } from "./types";

export const REVIEW_MOVE_TOLERANCE_CP = 35;

export interface MoveAttemptScore {
  readonly legal: boolean;
  readonly accepted: boolean;
  readonly attemptedMoveUci: string;
  readonly bestMoveUci: string;
  readonly evaluationGapCp: number | null;
  readonly comparison: string;
}

export interface ReviewTrainingLog {
  readonly subject: "chess";
  readonly theme: LearningTheme;
  readonly firstAttemptScore: number;
  readonly originalAttemptScore?: number;
  readonly closeTransferScore?: number | null;
  readonly unlabeledTransferScore?: number | null;
  readonly hardSpot: string;
  readonly dueReview: string;
  readonly nextGameReinforcement: string;
  readonly transfer: "completed" | "scheduled-next-game";
  readonly completedAt: string;
}

const themeNames: Readonly<Record<LearningTheme, string>> = {
  "hanging-piece": "loose piece",
  "one-move-threat": "one-move threat",
  "premature-central-exchange": "central tension",
  "king-safety": "king safety",
  development: "development",
  calculation: "calculation",
  "endgame-technique": "endgame technique",
  other: "position demand",
};

export interface AttemptFeedback {
  readonly title: "Good move" | "Try another move";
  readonly summary: string;
}

const sanForMove = (fen: string, uci: string): string => {
  try {
    const game = new Chess(fen);
    return game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
    }).san;
  } catch {
    return uci;
  }
};

export const getAttemptFeedback = (input: {
  readonly fen: string;
  readonly theme: LearningTheme;
  readonly score: MoveAttemptScore;
}): AttemptFeedback => {
  const attemptedSan = sanForMove(input.fen, input.score.attemptedMoveUci);
  const bestSan = sanForMove(input.fen, input.score.bestMoveUci);
  const gap = input.score.evaluationGapCp;
  return {
    title: input.score.accepted ? "Good move" : "Try another move",
    summary: `Played ${attemptedSan}. Stockfish candidate: ${bestSan}.${gap === null ? "" : " Evaluation gap: " + String(gap) + " cp."}`,
  };
};

const isSquare = (value: string): value is Square => /^[a-h][1-8]$/.test(value);

const legalMove = (fen: string, uci: string): boolean => {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (!isSquare(from) || !isSquare(to)) return false;
  try {
    const chess = new Chess(fen);
    chess.move({
      from,
      to,
      ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
    });
    return true;
  } catch {
    return false;
  }
};

const scoreCandidates = (input: {
  readonly fen: string;
  readonly attemptedMoveUci: string;
  readonly candidates: readonly {
    readonly uci: string;
    readonly evaluationCp: number;
  }[];
  readonly acceptedMoves: readonly string[];
  readonly toleranceCp: number;
  readonly theme: LearningTheme;
}): MoveAttemptScore => {
  const bestCandidate = input.candidates.toSorted(
    (left, right) => right.evaluationCp - left.evaluationCp,
  )[0];
  if (bestCandidate === undefined) {
    return {
      legal: false,
      accepted: false,
      attemptedMoveUci: input.attemptedMoveUci,
      bestMoveUci: "",
      evaluationGapCp: null,
      comparison:
        "No verified candidate was available, so this attempt was not scored.",
    };
  }

  const legal = legalMove(input.fen, input.attemptedMoveUci);
  const attemptedCandidate = input.candidates.find(
    (candidate) => candidate.uci === input.attemptedMoveUci,
  );
  const evaluationGapCp =
    attemptedCandidate === undefined
      ? null
      : Math.max(
          0,
          bestCandidate.evaluationCp - attemptedCandidate.evaluationCp,
        );
  const accepted =
    legal &&
    input.acceptedMoves.includes(input.attemptedMoveUci) &&
    evaluationGapCp !== null &&
    evaluationGapCp <= input.toleranceCp;
  return {
    legal,
    accepted,
    attemptedMoveUci: input.attemptedMoveUci,
    bestMoveUci: bestCandidate.uci,
    evaluationGapCp,
    comparison: !legal
      ? "That move is not legal in this position. The board has been reset for another attempt."
      : accepted
        ? "Your move meets the position's demand. It is one of the coach's strongest choices."
        : "Your move is legal. The coach's line meets the position's demand more directly.",
  };
};

export const scoreMoveAttempt = (
  fact: MoveAnalysisFact,
  attemptedMoveUci: string,
  toleranceCp = REVIEW_MOVE_TOLERANCE_CP,
): MoveAttemptScore =>
  scoreCandidates({
    fen: fact.fenBefore,
    attemptedMoveUci,
    candidates: fact.candidates,
    acceptedMoves: fact.candidates
      .filter((candidate) => {
        const best = Math.max(
          ...fact.candidates.map((item) => item.evaluationCp),
        );
        return best - candidate.evaluationCp <= toleranceCp;
      })
      .map((candidate) => candidate.uci),
    toleranceCp,
    theme: fact.theme,
  });

export const scoreTransferAttempt = (
  exercise: PracticeExercise,
  attemptedMoveUci: string,
): MoveAttemptScore =>
  scoreCandidates({
    fen: exercise.fen,
    attemptedMoveUci,
    candidates: exercise.verification.candidates,
    acceptedMoves: exercise.acceptableMoves,
    toleranceCp: exercise.verification.toleranceCp,
    theme: exercise.theme,
  });

const addDays = (timestamp: string, days: number): string => {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const buildReviewTrainingLog = (input: {
  readonly theme: LearningTheme;
  readonly originalMoveAccepted: boolean;
  readonly closeMoveAccepted: boolean | null;
  readonly unlabeledMoveAccepted: boolean | null;
  readonly completedAt: string;
}): ReviewTrainingLog => {
  const scoredAttempts = [input.originalMoveAccepted];
  if (input.closeMoveAccepted !== null)
    scoredAttempts.push(input.closeMoveAccepted);
  if (input.unlabeledMoveAccepted !== null)
    scoredAttempts.push(input.unlabeledMoveAccepted);
  const firstAttemptScore = Math.round(
    (scoredAttempts.filter(Boolean).length / scoredAttempts.length) * 100,
  );
  const hardSpot = !input.originalMoveAccepted
    ? "Retrying the original decision"
    : input.closeMoveAccepted === false
      ? "Applying the pattern to a close analogue"
      : input.unlabeledMoveAccepted === false
        ? "Recognizing the pattern without a label"
        : "No hard spot observed in this set";
  const reviewDelayDays = firstAttemptScore === 100 ? 3 : 1;

  return {
    subject: "chess",
    theme: input.theme,
    firstAttemptScore,
    originalAttemptScore: input.originalMoveAccepted ? 100 : 0,
    closeTransferScore:
      input.closeMoveAccepted === null
        ? null
        : input.closeMoveAccepted
          ? 100
          : 0,
    unlabeledTransferScore:
      input.unlabeledMoveAccepted === null
        ? null
        : input.unlabeledMoveAccepted
          ? 100
          : 0,
    hardSpot,
    dueReview: addDays(input.completedAt, reviewDelayDays),
    nextGameReinforcement: cachedReflection(input.theme),
    transfer:
      input.closeMoveAccepted === null || input.unlabeledMoveAccepted === null
        ? "scheduled-next-game"
        : "completed",
    completedAt: input.completedAt,
  };
};

export const getThemeName = (theme: LearningTheme): string => themeNames[theme];
export const getThemeFeedback = (theme: LearningTheme): string =>
  cachedReflection(theme);
