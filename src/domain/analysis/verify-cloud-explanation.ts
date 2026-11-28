import { Chess, SQUARES, type Move } from "chess.js";
import { z } from "zod";

interface EvidenceMove {
  readonly id: string;
  readonly before: string;
  readonly from: string;
  readonly to: string;
  readonly promoted?: string;
}

export interface CloudExplanationEvidence {
  readonly startingFen: string;
  readonly stronger: readonly EvidenceMove[];
  readonly attempted: readonly EvidenceMove[];
}

const evidenceId = /^[AS][1-9]\d*$/;
const reference =
  /\{\{([AS][1-9]\d*|square:[a-h][1-8]|control:[AS][1-9]\d*:[a-h][1-8]:[a-h][1-8]|(?:lost-control|passed):[AS][1-9]\d*:[a-h][1-8])\}\}/g;
const rawNotation =
  /(?<![a-zA-Z0-9])(?:[a-h][1-8](?:[a-h][1-8][qrbn]?)?|[KQRBN](?:[a-h][1-8]|[a-h1-8])?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[O0][-–‑][O0](?:[-–‑][O0])?)(?:=?[QRBNqrbn])?[+#]?(?![a-zA-Z0-9])/u;
const rawControl =
  /\b(?:control(?:s|led|ling)?|(?:cover|guard|protect|defend|attack)(?:s|ed|ing)?)\b/i;
const pawnClaim =
  /\b(?:diagonal|passed|passer|promotion square|(?:can|could|cannot|can't|couldn't)\s+(?:legally\s+)?recapture)\b/i;
const pieces = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
} as const;

const replySchema = z
  .object({
    status: z.enum(["explained", "insufficient"]),
    explanation: z.string().trim().min(1).max(700),
    evidence: z.array(z.string().regex(evidenceId)).max(40),
  })
  .strict();

function checkedMoves(packet: CloudExplanationEvidence) {
  const moves = new Map<string, Move>();
  for (const [prefix, line] of [
    ["S", packet.stronger],
    ["A", packet.attempted],
  ] as const) {
    const board = new Chess(packet.startingFen);
    for (const [index, step] of line.entries()) {
      if (
        step.id !== prefix + String(index + 1) ||
        step.before !== board.fen() ||
        board.isGameOver()
      )
        return null;
      const uci = step.from + step.to + (step.promoted ?? "");
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
      const move = board.move(uci);
      if (move.lan !== uci) return null;
      moves.set(step.id, move);
    }
  }
  return moves;
}

function controlledSquare(move: Move, origin: string, target: string) {
  const board = new Chess(move.after);
  const from = SQUARES.find((square) => square === origin);
  const to = SQUARES.find((square) => square === target);
  if (!from || !to) return null;
  const piece = board.get(from);
  if (!piece || !board.attackers(to, piece.color).includes(from)) return null;
  const side = piece.color === "w" ? "White" : "Black";
  return `${side}’s ${pieces[piece.type]} on ${from} covers ${to} after ${move.san}`;
}

function lostControl(move: Move, target: string) {
  const square = SQUARES.find((value) => value === target);
  if (!square) return null;
  const prior = new Chess(move.before);
  const next = new Chess(move.after);
  if (
    !prior.attackers(square, move.color).includes(move.from) ||
    next.attackers(square, move.color).includes(move.to)
  )
    return null;
  const side = move.color === "w" ? "White" : "Black";
  return `${side}’s ${pieces[move.piece]} no longer covers ${square} after ${move.san}`;
}

function passedPawn(move: Move, target: string) {
  const square = SQUARES.find((value) => value === target);
  if (!square) return null;
  const board = new Chess(move.after);
  const pawn = board.get(square);
  if (pawn?.type !== "p") return null;
  const opponent = pawn.color === "w" ? "b" : "w";
  const rank = Number(square.slice(1));
  const blocked = board
    .findPiece({ type: "p", color: opponent })
    .some(
      (enemy) =>
        Math.abs(enemy.charCodeAt(0) - square.charCodeAt(0)) <= 1 &&
        (Number(enemy.slice(1)) - rank) * (pawn.color === "w" ? 1 : -1) > 0,
    );
  if (blocked) return null;
  const side = pawn.color === "w" ? "White" : "Black";
  return `${side} has a passed pawn on ${square} after ${move.san}`;
}

type Rejection =
  | "invalid-response"
  | "invalid-replay"
  | "unknown-evidence"
  | "raw-notation"
  | "raw-control"
  | "raw-pawn-claim"
  | "unsupported-control"
  | "unsupported-pawn"
  | "invalid-reference";

export type VerifiedCloudExplanation =
  | {
      readonly status: "verified";
      readonly explanation: string;
      readonly evidence: readonly string[];
    }
  | { readonly status: "insufficient" }
  | { readonly status: "rejected"; readonly reason: Rejection };

export function verifyCloudExplanation(
  packet: CloudExplanationEvidence,
  output: unknown,
): VerifiedCloudExplanation {
  const parsed = replySchema.safeParse(output);
  if (!parsed.success)
    return { status: "rejected", reason: "invalid-response" };
  if (parsed.data.status === "insufficient") return { status: "insufficient" };

  let moves: Map<string, Move> | null;
  try {
    moves = checkedMoves(packet);
  } catch {
    return { status: "rejected", reason: "invalid-replay" };
  }
  if (!moves) return { status: "rejected", reason: "invalid-replay" };

  const { explanation, evidence } = parsed.data;
  if (evidence.some((id) => !moves.has(id)))
    return { status: "rejected", reason: "unknown-evidence" };
  const prose = explanation.replace(reference, "");
  if (/[{}]/.test(prose))
    return { status: "rejected", reason: "invalid-reference" };
  if (rawNotation.test(prose))
    return { status: "rejected", reason: "raw-notation" };
  if (rawControl.test(prose))
    return { status: "rejected", reason: "raw-control" };
  if (
    prose
      .split(/[.!?]/)
      .some(
        (sentence) => /\bpawns?\b/i.test(sentence) && pawnClaim.test(sentence),
      )
  )
    return { status: "rejected", reason: "raw-pawn-claim" };

  const replacements = new Map<string, string>();
  let referencesStrongerMove = false;
  for (const [token, key] of explanation.matchAll(reference)) {
    if (!key) return { status: "rejected", reason: "invalid-reference" };
    if (key.startsWith("square:")) {
      replacements.set(token, key.slice(7));
      continue;
    }
    if (key.startsWith("control:")) {
      const [, id, from, to] = key.split(":");
      const move = id && evidence.includes(id) ? moves.get(id) : undefined;
      const control =
        move && from && to ? controlledSquare(move, from, to) : null;
      if (!control)
        return { status: "rejected", reason: "unsupported-control" };
      replacements.set(token, control);
      continue;
    }
    if (key.startsWith("lost-control:") || key.startsWith("passed:")) {
      const [kind, id, square] = key.split(":");
      const move = id && evidence.includes(id) ? moves.get(id) : undefined;
      const fact =
        move && square
          ? kind === "passed"
            ? passedPawn(move, square)
            : lostControl(move, square)
          : null;
      if (!fact)
        return {
          status: "rejected",
          reason:
            kind === "passed" ? "unsupported-pawn" : "unsupported-control",
        };
      replacements.set(token, fact);
      continue;
    }
    const move = evidence.includes(key) ? moves.get(key) : undefined;
    if (!move) return { status: "rejected", reason: "invalid-reference" };
    referencesStrongerMove ||= key.startsWith("S");
    replacements.set(token, move.san);
  }
  if (!referencesStrongerMove)
    return { status: "rejected", reason: "invalid-reference" };

  return {
    status: "verified",
    explanation: explanation.replace(
      reference,
      (token) => replacements.get(token) ?? token,
    ),
    evidence,
  };
}
