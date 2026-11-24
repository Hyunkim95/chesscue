import { Chess, type Square } from "chess.js";

import type {
  CuratedTransferExercise,
  TransferExerciseValidation,
} from "./types";

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const UNLABELED_PROMPT = "What would you play here?";

const isSquare = (value: string): value is Square => /^[a-h][1-8]$/.test(value);

const legalMove = (fen: string, uci: string): boolean => {
  if (!UCI_PATTERN.test(uci)) return false;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (!isSquare(from) || !isSquare(to)) return false;
  try {
    const chess = new Chess(fen);
    chess.move({
      from,
      to,
      ...(uci.length === 5 ? { promotion: uci[4] } : {}),
    });
    return true;
  } catch {
    return false;
  }
};

const legalVariation = (fen: string, moves: readonly string[]): boolean => {
  if (moves.length === 0 || moves.length > 20) return false;
  try {
    const chess = new Chess(fen);
    for (const uci of moves) {
      if (!UCI_PATTERN.test(uci) || chess.isGameOver()) return false;
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      if (!isSquare(from) || !isSquare(to)) return false;
      chess.move({
        from,
        to,
        ...(uci.length === 5 ? { promotion: uci[4] } : {}),
      });
    }
    return true;
  } catch {
    return false;
  }
};

const unique = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

export const validateCuratedTransferExercise = (
  input: CuratedTransferExercise,
): TransferExerciseValidation => {
  if (input.schemaVersion !== 1 || !VERSION_PATTERN.test(input.version)) {
    return { ok: false, reason: "Exercise schema or version is invalid." };
  }
  if (input.id.trim().length === 0 || input.prompt.trim().length === 0) {
    return { ok: false, reason: "Exercise identity and prompt are required." };
  }
  if (input.difficulty === "unlabeled" && input.prompt !== UNLABELED_PROMPT) {
    return {
      ok: false,
      reason: "Unlabeled exercises must use the neutral prompt.",
    };
  }
  try {
    const chess = new Chess(input.fen);
    if (chess.isGameOver()) {
      return { ok: false, reason: "Exercise position is already terminal." };
    }
  } catch {
    return { ok: false, reason: "Exercise FEN is invalid." };
  }
  if (
    input.acceptableMoves.length === 0 ||
    !unique(input.acceptableMoves) ||
    input.acceptableMoves.some((move) => !legalMove(input.fen, move))
  ) {
    return {
      ok: false,
      reason: "Every acceptable move must be unique and legal.",
    };
  }
  if (
    input.verification.engine !== "Stockfish 19 Lite WASM" ||
    input.verification.moveTimeMs !== 700 ||
    input.verification.multiPv !== 3 ||
    input.verification.verifiedAt !== "2026-11-24" ||
    input.verification.toleranceCp < 0
  ) {
    return { ok: false, reason: "Stockfish verification metadata is invalid." };
  }
  const candidates = input.verification.candidates;
  if (
    candidates.length === 0 ||
    !unique(candidates.map(({ uci }) => uci)) ||
    candidates.some(({ uci }) => !legalMove(input.fen, uci))
  ) {
    return {
      ok: false,
      reason: "Verified candidates must be unique legal moves.",
    };
  }
  const best = candidates.toSorted(
    (left, right) => right.evaluationCp - left.evaluationCp,
  )[0];
  if (best?.uci !== input.verification.bestMoveUci) {
    return { ok: false, reason: "Verified best move does not match scores." };
  }
  if (
    input.verification.principalVariation[0] !==
      input.verification.bestMoveUci ||
    !legalVariation(input.fen, input.verification.principalVariation)
  ) {
    return {
      ok: false,
      reason:
        "Verified principal variation must be legal and start with the best move.",
    };
  }
  for (const acceptable of input.acceptableMoves) {
    const candidate = candidates.find(({ uci }) => uci === acceptable);
    if (candidate === undefined) {
      return {
        ok: false,
        reason: "An acceptable move lacks Stockfish verification.",
      };
    }
    if (
      best.evaluationCp - candidate.evaluationCp >
      input.verification.toleranceCp
    ) {
      return {
        ok: false,
        reason: "An acceptable move exceeds the verification tolerance.",
      };
    }
  }
  if (
    input.explanation.trim().length < 20 ||
    input.provenance.trim().length < 20
  ) {
    return {
      ok: false,
      reason: "Exercise explanation and provenance are incomplete.",
    };
  }
  return { ok: true, exercise: Object.freeze(structuredClone(input)) };
};
