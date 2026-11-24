import { Chess } from "chess.js";

import type { LessonFactPacket, LessonPlaybook } from "./types";

export type LessonFactValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };

interface ParsedUciMove {
  readonly from: string;
  readonly to: string;
  readonly promotion: string | null;
}

const parseUciMove = (move: string): ParsedUciMove | null => {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(move.toLowerCase());
  if (match === null) return null;
  const from = match[1];
  const to = match[2];
  if (from === undefined || to === undefined) return null;
  return { from, to, promotion: match[3] ?? null };
};

const isLegalMove = (chess: Chess, uci: string): boolean => {
  const parsed = parseUciMove(uci);
  if (parsed === null) return false;
  return chess
    .moves({ verbose: true })
    .some(
      (move) =>
        move.from === parsed.from &&
        move.to === parsed.to &&
        (parsed.promotion === null || move.promotion === parsed.promotion),
    );
};

const movesEndangeredPiece = (uci: string, endangeredSquare: string): boolean =>
  parseUciMove(uci)?.from === endangeredSquare;

const withTurn = (fen: string, turn: "w" | "b"): string | null => {
  const fields = fen.split(" ");
  if (fields.length !== 6) return null;
  fields[1] = turn;
  return fields.join(" ");
};

const validateHangingPieceFacts = (
  facts: LessonFactPacket,
): LessonFactValidation => {
  let position: Chess;
  try {
    position = new Chess(facts.fen);
  } catch {
    return { valid: false, reason: "invalid-fen" };
  }

  const endangered = position
    .board()
    .flat()
    .find((piece) => piece?.square === facts.endangeredSquare);
  if (endangered?.color !== position.turn()) {
    return { valid: false, reason: "endangered-piece-not-owned-by-learner" };
  }
  if (
    facts.acceptableMoves.length === 0 ||
    facts.acceptableMoves.some(
      (move) =>
        !movesEndangeredPiece(move, facts.endangeredSquare) ||
        !isLegalMove(position, move),
    )
  ) {
    return { valid: false, reason: "illegal-acceptable-move" };
  }
  if (
    facts.transferMoves.length === 0 ||
    facts.transferMoves.some(
      (move) =>
        !movesEndangeredPiece(move, facts.endangeredSquare) ||
        !isLegalMove(position, move),
    )
  ) {
    return { valid: false, reason: "illegal-transfer-move" };
  }

  const opponentTurn = position.turn() === "w" ? "b" : "w";
  const opponentFen = withTurn(facts.fen, opponentTurn);
  if (opponentFen === null)
    return { valid: false, reason: "invalid-fen-fields" };

  let opponentPosition: Chess;
  try {
    opponentPosition = new Chess(opponentFen);
  } catch {
    return { valid: false, reason: "invalid-opponent-position" };
  }
  const threat = parseUciMove(facts.threatenedMove);
  if (
    threat?.to !== facts.endangeredSquare ||
    !isLegalMove(opponentPosition, facts.threatenedMove)
  ) {
    return { valid: false, reason: "threat-does-not-capture-endangered-piece" };
  }
  return { valid: true };
};

export const validateLessonFacts = (
  playbook: LessonPlaybook,
  facts: LessonFactPacket,
): LessonFactValidation => {
  if (playbook.theme !== facts.theme)
    return { valid: false, reason: "fact-theme-mismatch" };
  if (playbook.id === "tactics.hanging-piece")
    return validateHangingPieceFacts(facts);
  return { valid: false, reason: "unsupported-playbook-validator" };
};
