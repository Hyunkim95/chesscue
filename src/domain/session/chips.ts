import { Chess, type Move } from "chess.js";

import type { Chip, SessionKind } from "./types";

// Suggestion chips (design §3.3), chosen by code from the board, Stockfish's
// moves and the session state. At most three questions plus the state's own
// action. A chip never names the best move before the position is solved.
export interface ChipContext {
  // The position the player is solving.
  readonly fen: string;
  readonly bestUci: string;
  // The move played in the real game, if the position came from one.
  readonly playedInGame?: SanMove | undefined;
  // Rook's answer to the latest try.
  readonly reply?: SanMove | undefined;
  // Stockfish's best move that is not the solution, for "What if …?".
  readonly bestNonSolution?: SanMove | undefined;
  // Rook's best defence other than his main-line reply; none when forced.
  readonly bestDefence?: SanMove | undefined;
  readonly quiet: boolean;
  readonly online: boolean;
}

export interface SanMove {
  readonly uci: string;
  readonly san: string;
}

export const MAX_QUESTION_CHIPS = 3;

function withOpponentToMove(fen: string): Chess | undefined {
  const fields = fen.split(" ");
  const turn = fields[1] === "w" ? "b" : "w";
  try {
    const board = new Chess(fen);
    if (board.inCheck()) return undefined;
    return new Chess([fields[0], turn, fields[2], "-", "0", "1"].join(" "));
  } catch {
    return undefined;
  }
}

const forcing = (move: Move) =>
  move.captured !== undefined ||
  move.san.includes("+") ||
  move.san.includes("#");

export function opponentHasForcingMove(fen: string): boolean {
  return (
    withOpponentToMove(fen)?.moves({ verbose: true }).some(forcing) ?? false
  );
}

export function playerHasCheck(fen: string): boolean {
  try {
    return new Chess(fen)
      .moves({ verbose: true })
      .some((move) => move.san.includes("+") || move.san.includes("#"));
  } catch {
    return false;
  }
}

function questions(kind: SessionKind, context: ChipContext): Chip[] {
  const { reply, playedInGame, bestNonSolution, bestDefence } = context;
  switch (kind) {
    case "before":
      return [
        ...(opponentHasForcingMove(context.fen)
          ? [
              {
                id: "threats",
                label: "What are you threatening?",
                action: { kind: "threats" },
              } as const,
            ]
          : []),
        ...(playerHasCheck(context.fen)
          ? [
              {
                id: "checks",
                label: "Any checks for me?",
                action: { kind: "checks" },
              } as const,
            ]
          : []),
        ...(playedInGame
          ? [
              {
                id: `why:${playedInGame.uci}`,
                label: `Why not ${playedInGame.san}?`,
                action: { kind: "why", uci: playedInGame.uci },
              } as const,
            ]
          : []),
      ];
    case "tried":
      return [
        ...(reply
          ? [
              {
                id: `why:${reply.uci}`,
                label: `Why ${reply.san}?`,
                action: { kind: "why", uci: reply.uci },
              } as const,
            ]
          : []),
        ...(opponentHasForcingMove(context.fen)
          ? [
              {
                id: "threats",
                label: "Your threats now?",
                action: { kind: "threats" },
              } as const,
            ]
          : []),
      ];
    case "second-miss":
      return [
        { id: "scan", label: "Scan for me", action: { kind: "scan" } },
        ...(bestNonSolution
          ? [
              {
                id: `what-if:${bestNonSolution.uci}`,
                label: `What if ${bestNonSolution.san}?`,
                action: { kind: "what-if", uci: bestNonSolution.uci },
              } as const,
            ]
          : []),
      ];
    case "solved":
      return [
        {
          id: "why-it-works",
          label: "Why does it work?",
          action: { kind: "why", uci: context.bestUci },
        },
        ...(bestDefence
          ? [
              {
                id: `what-if:${bestDefence.uci}`,
                label: `What if you'd played ${bestDefence.san}?`,
                action: { kind: "what-if", uci: bestDefence.uci },
              } as const,
            ]
          : []),
      ];
    case "shown":
    case "done":
      return [];
  }
}

export function chipsFor(
  kind: SessionKind,
  context: ChipContext,
): readonly Chip[] {
  const solved = kind === "solved" || kind === "shown" || kind === "done";
  const plan: Chip[] =
    context.quiet && context.online && !solved
      ? [{ id: "plan", label: "What's the plan?", action: { kind: "plan" } }]
      : [];
  const asked = [...questions(kind, context), ...plan]
    // Never point at the answer before it is found.
    .filter(
      ({ action }) =>
        solved || !("uci" in action) || action.uci !== context.bestUci,
    )
    .slice(0, MAX_QUESTION_CHIPS);
  return kind === "solved"
    ? [...asked, { id: "done", label: "Done ✓", action: { kind: "done" } }]
    : asked;
}
