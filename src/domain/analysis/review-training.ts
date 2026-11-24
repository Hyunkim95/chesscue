import { Chess, type Square } from "chess.js";

import type { CuratedTransferExercise } from "../transfer";
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

const themeFeedback: Readonly<Record<LearningTheme, string>> = {
  "hanging-piece":
    "A loose piece has more pressure on it than protection. Scan your attacked pieces before continuing your plan.",
  "one-move-threat":
    "A one-move threat is an immediate check, capture, or direct attack that must be handled before a slower plan.",
  "premature-central-exchange":
    "Central tension means both pawn structures can still change. Compare who benefits before releasing it.",
  "king-safety":
    "King safety comes first when the center may open. Secure the king before starting a new plan.",
  development:
    "Development brings a new piece into useful play. Improve inactive pieces before repeating moves without a reason.",
  calculation:
    "Calculation means checking the opponent's strongest reply before committing to a forcing line.",
  "endgame-technique":
    "Endgame technique depends on precise king and pawn sequencing, not only the first good-looking move.",
  other:
    "The position had one practical demand that needed to be addressed before continuing the plan.",
};

const reinforcementByTheme: Readonly<Record<LearningTheme, string>> = {
  "hanging-piece":
    "The next opponent will create ordinary piece-pressure decisions. Before every move, scan your attacked pieces and compare attackers with defenders.",
  "one-move-threat":
    "The next game will emphasize forcing replies. Before choosing a plan, scan the opponent's checks, captures, and direct attacks.",
  "premature-central-exchange":
    "The next opening will preserve central tension. Name which side benefits before exchanging a central pawn.",
  "king-safety":
    "The next game will open the center only after a king-safety decision. Complete development and secure the king before attacking.",
  development:
    "The next opening will reward bringing a new piece into play before moving an already developed piece again.",
  calculation:
    "The next game will include one forcing decision. Calculate the opponent's strongest reply before committing.",
  "endgame-technique":
    "The next game will favor a simplified ending. Start each critical turn with the most forcing king or pawn move.",
  other:
    "The next focus game will recreate this decision type and ask for one explicit reason before the move is committed.",
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
        ? `Your move handles the ${themeNames[input.theme]} and stays inside the verified tolerance.`
        : `Your move is legal, but it does not handle the ${themeNames[input.theme]} as reliably as the verified line.`,
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
  exercise: CuratedTransferExercise,
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
    nextGameReinforcement: reinforcementByTheme[input.theme],
    transfer:
      input.closeMoveAccepted === null || input.unlabeledMoveAccepted === null
        ? "scheduled-next-game"
        : "completed",
    completedAt: input.completedAt,
  };
};

export const getThemeName = (theme: LearningTheme): string => themeNames[theme];
export const getThemeFeedback = (theme: LearningTheme): string =>
  themeFeedback[theme];
