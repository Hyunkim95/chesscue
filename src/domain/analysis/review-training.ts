import { Chess, type Square } from "chess.js";

import type { LearningTheme, MoveAnalysisFact } from "./types";

export const REVIEW_MOVE_TOLERANCE_CP = 35;

export interface ThemeChoice {
  readonly theme: LearningTheme;
  readonly label: string;
}

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
  readonly hardSpot: string;
  readonly dueReview: string;
  readonly nextGameReinforcement: string;
  readonly transfer: "completed" | "scheduled-next-game";
  readonly completedAt: string;
}

const themeLabels: Readonly<Record<LearningTheme, string>> = {
  "hanging-piece": "An attacked piece may be left loose",
  "one-move-threat": "The opponent has an immediate forcing threat",
  "premature-central-exchange": "The central tension should be preserved",
  "king-safety": "The king needs safety before the position opens",
  development: "A new piece should join the game",
  calculation: "The forcing line needs one more reply checked",
  "endgame-technique": "The king or pawn sequence needs precision",
  other: "A general positional tradeoff matters most",
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

const themeOrder: readonly LearningTheme[] = [
  "hanging-piece",
  "one-move-threat",
  "premature-central-exchange",
  "king-safety",
  "development",
  "calculation",
  "endgame-technique",
  "other",
];

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

export const buildThemeChoices = (
  theme: LearningTheme,
): readonly ThemeChoice[] => {
  const choices = themeOrder.slice(0, 4).includes(theme)
    ? themeOrder.slice(0, 4)
    : [...themeOrder.slice(0, 3), theme];
  return choices.map((choice) => ({
    theme: choice,
    label: themeLabels[choice],
  }));
};

export const scoreThemeRetrieval = (
  selected: LearningTheme,
  expected: LearningTheme,
): boolean => selected === expected;

const themeComparison = (theme: LearningTheme, accepted: boolean): string => {
  if (accepted) {
    return `Your move solves the ${themeLabels[theme].toLowerCase()} problem and stays inside the verified tolerance.`;
  }
  return `Your move is legal, but it does not resolve the ${themeLabels[theme].toLowerCase()} problem as reliably as the verified line.`;
};

export const scoreMoveAttempt = (
  fact: MoveAnalysisFact,
  attemptedMoveUci: string,
  toleranceCp = REVIEW_MOVE_TOLERANCE_CP,
): MoveAttemptScore => {
  const bestCandidate = fact.candidates.toSorted(
    (left, right) => right.evaluationCp - left.evaluationCp,
  )[0];
  if (bestCandidate === undefined) {
    return {
      legal: false,
      accepted: false,
      attemptedMoveUci,
      bestMoveUci: "",
      evaluationGapCp: null,
      comparison:
        "No verified candidate was available, so this attempt was not scored.",
    };
  }

  const legal = legalMove(fact.fenBefore, attemptedMoveUci);
  const attemptedCandidate = fact.candidates.find(
    (candidate) => candidate.uci === attemptedMoveUci,
  );
  const evaluationGapCp =
    attemptedCandidate === undefined
      ? null
      : Math.max(
          0,
          bestCandidate.evaluationCp - attemptedCandidate.evaluationCp,
        );
  const accepted =
    legal && evaluationGapCp !== null && evaluationGapCp <= toleranceCp;

  return {
    legal,
    accepted,
    attemptedMoveUci,
    bestMoveUci: bestCandidate.uci,
    evaluationGapCp,
    comparison: legal
      ? themeComparison(fact.theme, accepted)
      : "That move is not legal in this position. The board has been reset for another attempt.",
  };
};

export const selectTransferFact = (
  facts: readonly MoveAnalysisFact[],
  primary: MoveAnalysisFact,
): MoveAnalysisFact | null =>
  facts
    .filter(
      (fact) =>
        fact.theme === primary.theme &&
        (fact.gameId !== primary.gameId || fact.ply !== primary.ply),
    )
    .toSorted((left, right) => {
      const impactDifference = right.impactCp - left.impactCp;
      return impactDifference === 0 ? left.ply - right.ply : impactDifference;
    })[0] ?? null;

const addDays = (timestamp: string, days: number): string => {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const buildReviewTrainingLog = (input: {
  readonly theme: LearningTheme;
  readonly themeCorrect: boolean;
  readonly primaryMoveAccepted: boolean;
  readonly transferMoveAccepted: boolean | null;
  readonly completedAt: string;
}): ReviewTrainingLog => {
  const scoredAttempts = [input.themeCorrect, input.primaryMoveAccepted];
  if (input.transferMoveAccepted !== null)
    scoredAttempts.push(input.transferMoveAccepted);
  const firstAttemptScore = Math.round(
    (scoredAttempts.filter(Boolean).length / scoredAttempts.length) * 100,
  );
  const hardSpot = !input.themeCorrect
    ? "Recognizing the position's main demand"
    : !input.primaryMoveAccepted
      ? "Choosing a move that resolves the demand"
      : input.transferMoveAccepted === false
        ? "Transferring the idea to a second position"
        : "No hard spot observed in this set";
  const reviewDelayDays = firstAttemptScore === 100 ? 3 : 1;

  return {
    subject: "chess",
    theme: input.theme,
    firstAttemptScore,
    hardSpot,
    dueReview: addDays(input.completedAt, reviewDelayDays),
    nextGameReinforcement: reinforcementByTheme[input.theme],
    transfer:
      input.transferMoveAccepted === null ? "scheduled-next-game" : "completed",
    completedAt: input.completedAt,
  };
};

export const getThemeLabel = (theme: LearningTheme): string =>
  themeLabels[theme];
