import { Chess, type PieceSymbol, type Square } from "chess.js";

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
    "Before every move, check whether one of your pieces is attacked and cannot be safely defended.",
  "one-move-threat":
    "Before starting a plan, look for immediate checks, captures, and direct threats from both sides.",
  "premature-central-exchange":
    "Before exchanging central pawns, ask which side benefits when the center opens.",
  "king-safety":
    "When the center may open, secure your king before beginning a slower plan.",
  development:
    "Bring inactive pieces into the game before moving the same developed piece again.",
  calculation:
    "Before committing to a move, check the opponent's strongest reply.",
  "endgame-technique":
    "In an endgame, check the exact king and pawn move order before committing.",
  other:
    "Handle the most urgent threat or opportunity before continuing your plan.",
};

const pieceNames: Readonly<Record<PieceSymbol, string>> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
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

const loosePieceFeedback = (
  fen: string,
  score: MoveAttemptScore,
  attemptedSan: string,
  bestSan: string,
): string | null => {
  try {
    const game = new Chess(fen);
    const player = game.turn();
    const opponent = player === "w" ? "b" : "w";
    const loosePiece = game
      .board()
      .flat()
      .filter((piece) => piece?.color === player && piece.type !== "k")
      .find((piece) => {
        if (piece === null) return false;
        return (
          game.attackers(piece.square, opponent).length >
          game.attackers(piece.square, player).length
        );
      });
    if (loosePiece === null || loosePiece === undefined) return null;
    const attackerSquare = game.attackers(loosePiece.square, opponent)[0];
    const attacker =
      attackerSquare === undefined ? undefined : game.get(attackerSquare);
    const pieceName = pieceNames[loosePiece.type];

    if (score.accepted) {
      return score.attemptedMoveUci.startsWith(loosePiece.square)
        ? `You played ${attemptedSan}. That moves your ${pieceName} out of attack before Black can win it.`
        : `You played ${attemptedSan}. That deals with the attack on your ${pieceName} before Black can win it.`;
    }

    const after = new Chess(fen);
    after.move({
      from: score.attemptedMoveUci.slice(0, 2),
      to: score.attemptedMoveUci.slice(2, 4),
      ...(score.attemptedMoveUci.length === 5
        ? { promotion: score.attemptedMoveUci.slice(4, 5) }
        : {}),
    });
    const pieceStillLoose =
      after.get(loosePiece.square)?.color === player &&
      after.attackers(loosePiece.square, opponent).length >
        after.attackers(loosePiece.square, player).length;
    if (
      pieceStillLoose &&
      attackerSquare !== undefined &&
      attacker !== undefined
    ) {
      return `You played ${attemptedSan}. Your ${pieceName} on ${loosePiece.square} is still attacked by Black's ${pieceNames[attacker.type]} on ${attackerSquare}, so Black can win it next.`;
    }
    return `You played ${attemptedSan}. It is legal, but ${bestSan} handles the danger more safely.`;
  } catch {
    return null;
  }
};

const acceptedExplanations: Readonly<Record<LearningTheme, string>> = {
  "hanging-piece": "It deals with the attacked piece before material is lost.",
  "one-move-threat":
    "It handles the immediate forcing threat before starting another plan.",
  "premature-central-exchange":
    "It makes a sound choice while the central pawns can still change.",
  "king-safety": "It improves king safety before the center opens.",
  development: "It improves piece coordination or control of the center.",
  calculation: "It holds up against the opponent's strongest reply.",
  "endgame-technique": "It keeps the endgame move order accurate.",
  other: "It handles the most urgent feature of the position.",
};

const rejectedExplanations: Readonly<Record<LearningTheme, string>> = {
  "hanging-piece": "It does not fully solve the danger to the attacked piece.",
  "one-move-threat": "It leaves the immediate forcing threat unanswered.",
  "premature-central-exchange":
    "It gives up central options before the position is ready.",
  "king-safety": "It leaves the king exposed while the center may open.",
  development: "It improves the position less directly than the coach move.",
  calculation: "It does not hold up as well against the strongest reply.",
  "endgame-technique": "It loses accuracy in the endgame move order.",
  other: "It misses the most urgent feature of the position.",
};

export const getAttemptFeedback = (input: {
  readonly fen: string;
  readonly theme: LearningTheme;
  readonly score: MoveAttemptScore;
}): AttemptFeedback => {
  const attemptedSan = sanForMove(input.fen, input.score.attemptedMoveUci);
  const bestSan = sanForMove(input.fen, input.score.bestMoveUci);
  const loosePiece =
    input.theme === "hanging-piece"
      ? loosePieceFeedback(input.fen, input.score, attemptedSan, bestSan)
      : null;
  if (loosePiece !== null) {
    return {
      title: input.score.accepted ? "Good move" : "Try another move",
      summary: loosePiece,
    };
  }
  return {
    title: input.score.accepted ? "Good move" : "Try another move",
    summary: input.score.accepted
      ? `You played ${attemptedSan}. ${acceptedExplanations[input.theme]}`
      : `You played ${attemptedSan}. ${rejectedExplanations[input.theme]} ${bestSan} is the stronger response.`,
  };
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
