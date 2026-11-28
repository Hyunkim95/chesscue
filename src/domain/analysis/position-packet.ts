import { Chess } from "chess.js";

import { PIECE_VALUE } from "./board-relations";
import { dangerFacts } from "./danger-facts";
import { standing, whyPacket } from "./why-packet";

// The checked facts for an open question about the position ("what's going
// on here?", "what should I think about?"), for a writer to phrase in Rook's
// voice. While the player is solving it names none of their moves, so a
// writer can point at what matters without giving the answer away. Pure:
// chess.js only.
export const POSITION_PACKET_VERSION = "position-packet/2";

export interface PositionPacket {
  readonly fen: string;
  readonly youAre: "White" | "Black";
  readonly toMove: "you" | "me";
  readonly material: string;
  // The moment's goal as the player already sees it.
  readonly goal: string | null;
  // What Rook threatens against the player's pieces and king.
  readonly myThreats: readonly string[];
  // While solving, the habit to apply instead of any move: counts of checks
  // and captures pointed at the answer (round 1 scorecard).
  readonly approach: string | null;
  // Only once the position is solved or shown: what the best move does.
  readonly bestMove: {
    readonly move: string;
    readonly takes: string | null;
    readonly attacks: readonly string[];
    readonly linesUp: readonly string[];
    readonly line: readonly string[];
    readonly endsWith: string;
  } | null;
}

export interface PositionInput {
  readonly fen: string;
  readonly learner: "w" | "b";
  readonly goal?: string | undefined;
  // Stockfish's best line in UCI, only once the answer may be named.
  readonly answerLine?: readonly string[] | undefined;
  // The best move while solving: a threat on its squares points at it.
  readonly hiddenUci?: string | undefined;
}

const SIDE = { w: "White", b: "Black" } as const;

export function positionPacket(
  input: PositionInput,
): PositionPacket | undefined {
  let board: Chess;
  try {
    board = new Chess(input.fen);
  } catch {
    return undefined;
  }
  let sum = 0;
  for (const piece of board.board().flat())
    if (piece)
      sum += (piece.color === input.learner ? 1 : -1) * PIECE_VALUE[piece.type];
  const yours = board.turn() === input.learner;
  const threats = yours ? (dangerFacts(input.fen) ?? []) : [];
  const answer =
    input.answerLine && input.answerLine.length > 0
      ? whyPacket({ fen: input.fen, bestLine: input.answerLine }, new Map())
      : undefined;
  return {
    fen: input.fen,
    youAre: SIDE[input.learner],
    toMove: yours ? "you" : "me",
    material: standing(sum),
    goal: input.goal ?? null,
    myThreats: threats
      .filter(({ kind }) => kind !== "attacked-but-safe")
      .filter(({ target, attackers }) => {
        const hidden = input.hiddenUci;
        if (hidden === undefined) return true;
        const squares: readonly string[] = [
          hidden.slice(0, 2),
          hidden.slice(2, 4),
        ];
        return (
          !squares.includes(target) &&
          !attackers.some((square) => squares.includes(square))
        );
      })
      .map(({ text }) => text),
    approach:
      answer || !yours
        ? null
        : "Look at every check, capture and threat you have before choosing.",
    bestMove: answer
      ? {
          move: answer.bestMove,
          takes: answer.bestMoveCaptures?.takes ?? null,
          attacks: answer.bestMoveAttacks.map(({ target }) => target),
          linesUp: answer.bestMoveLinesUp.map(
            ({ front, behind }) => `${front}, with the ${behind} behind it`,
          ),
          line: answer.bestLine.san,
          endsWith: answer.bestLine.endsWith,
        }
      : null,
  };
}
