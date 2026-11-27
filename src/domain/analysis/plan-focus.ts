import { Chess, type Color, type Move, type Square } from "chess.js";

import type { BoardArrow } from "./board-move-cues";
import {
  PIECE_NAME,
  PIECE_VALUE,
  joinedAnd,
  onMinorHome,
  opponent,
  undevelopedMinors,
} from "./board-relations";
import { CORE_CENTRE, centreControlChange } from "./centre-control";

// What a quiet position asks for, read from what Stockfish's best move does
// (owner decision, 27 November 2026): deal with a threat, get the king safe,
// wake up a sleeping piece, or fight for the centre. The pieces it names are
// outlined on the board, so the goal is shown as well as said.

export interface PlanOutline {
  readonly square: Square;
  readonly tone: "coral" | "jade";
}

export interface PlanFocus {
  readonly kind: "threat" | "castle" | "develop" | "centre";
  readonly prompt: string;
  readonly arrows: readonly BoardArrow[];
  readonly outlines: readonly PlanOutline[];
}

interface Capture {
  readonly from: Square;
  readonly to: Square;
}

function play(fen: string, uci: string): Move | undefined {
  try {
    return new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    });
  } catch {
    return undefined;
  }
}

// The swap-off on one square: what the first capture nets once both sides
// recapture with their cheapest pieces and either may stop. Values ascend.
function exchangeGain(
  target: number,
  attackers: readonly number[],
  defenders: readonly number[],
): number {
  const [first, ...rest] = attackers;
  if (first === undefined) return 0;
  const gains = [target];
  const sides = [defenders, rest];
  const next = [0, 0];
  let onSquare = first;
  for (let side = 0; ; side = 1 - side) {
    const list = sides[side] ?? [];
    const index = next[side] ?? 0;
    const capturer = list[index];
    if (capturer === undefined) break;
    gains.push(onSquare - (gains.at(-1) ?? 0));
    onSquare = capturer;
    next[side] = index + 1;
  }
  for (let depth = gains.length - 1; depth > 0; depth -= 1)
    gains[depth - 1] = -Math.max(-(gains[depth - 1] ?? 0), gains[depth] ?? 0);
  return gains[0] ?? 0;
}

function values(board: Chess, squares: readonly Square[]): number[] {
  return squares
    .flatMap((square) => {
      const piece = board.get(square);
      return piece ? [PIECE_VALUE[piece.type]] : [];
    })
    .toSorted((a, b) => a - b);
}

// Captures `by` could make that win material if it were its move.
export function winningCaptures(fen: string, by: Color): Capture[] {
  let board: Chess;
  try {
    board = new Chess(fen);
    if (board.turn() !== by) {
      if (board.inCheck()) return [];
      const fields = fen.split(" ");
      board = new Chess([fields[0], by, fields[2], "-", "0", "1"].join(" "));
    }
  } catch {
    return [];
  }
  const owner = opponent(by);
  return board
    .moves({ verbose: true })
    .filter(({ captured, from, to }) => {
      if (captured === undefined || captured === "k") return false;
      const others = board
        .attackers(to, by)
        .filter((square) => square !== from);
      const piece = board.get(from);
      if (!piece) return false;
      return (
        exchangeGain(
          PIECE_VALUE[captured],
          [PIECE_VALUE[piece.type], ...values(board, others)],
          values(board, board.attackers(to, owner)),
        ) > 0
      );
    })
    .map(({ from, to }) => ({ from, to }));
}

function threatFocus(
  board: Chess,
  move: Move,
  us: Color,
): PlanFocus | undefined {
  const them = opponent(us);
  const prompt = "First, deal with my threat.";
  if (board.inCheck()) {
    const kings = board.findPiece({ type: "k", color: us });
    return {
      kind: "threat",
      prompt,
      arrows: kings.flatMap((king) =>
        board
          .attackers(king, them)
          .map((from) => ({ from, to: king, kind: "reply" as const })),
      ),
      outlines: kings.map((square) => ({ square, tone: "coral" as const })),
    };
  }
  const before = winningCaptures(board.fen(), them);
  const after = winningCaptures(move.after, them);
  const resolved = before.filter(
    ({ from, to }) =>
      !after.some((other) => other.from === from && other.to === to),
  );
  const target = resolved
    .map(({ to }) => to)
    .toSorted((a, b) => {
      const value = (square: Square) => {
        const piece = board.get(square);
        return piece ? PIECE_VALUE[piece.type] : 0;
      };
      return value(b) - value(a);
    })[0];
  if (target === undefined) return undefined;
  return {
    kind: "threat",
    prompt,
    arrows: resolved
      .filter(({ to }) => to === target)
      .map(({ from, to }) => ({ from, to, kind: "reply" as const })),
    outlines: [{ square: target, tone: "coral" }],
  };
}

function sleepers(squares: readonly { type: "n" | "b"; square: Square }[]) {
  return (["n", "b"] as const)
    .flatMap((type) => {
      const own = squares
        .filter((piece) => piece.type === type)
        .map(({ square }) => square)
        .toSorted();
      if (own.length === 0) return [];
      return [
        `${PIECE_NAME[type]}${own.length > 1 ? "s" : ""} on ${joinedAnd(own)}`,
      ];
    })
    .join(" and ");
}

// The best move itself starts from a home square, so at least one minor
// piece is listed.
function developFocus(board: Chess, us: Color): PlanFocus {
  const asleep = undevelopedMinors(board, us).flatMap(({ type, square }) =>
    type === "n" || type === "b" ? [{ type, square }] : [],
  );
  const one = asleep.length === 1;
  return {
    kind: "develop",
    prompt: `Your ${sleepers(asleep)} ${one ? "is" : "are"} still asleep. Wake ${one ? "it" : "one"} up.`,
    arrows: [],
    outlines: asleep.map(({ square }) => ({ square, tone: "jade" as const })),
  };
}

// The concrete goal of a quiet position whose best move is `bestUci`, or
// undefined when the move does none of these things.
export function planFocus(fen: string, bestUci: string): PlanFocus | undefined {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return undefined;
  }
  const move = play(fen, bestUci);
  if (!move) return undefined;
  const us = board.turn();
  const threat = threatFocus(board, move, us);
  if (threat) return threat;
  if (move.san.startsWith("O-O"))
    return {
      kind: "castle",
      prompt: "Get your king to safety.",
      arrows: [],
      outlines: [{ square: move.from, tone: "jade" }],
    };
  if (onMinorHome(move.piece, us, move.from)) return developFocus(board, us);
  const centre =
    CORE_CENTRE.includes(move.to) ||
    centreControlChange(fen, move.lan).gained.some((square) =>
      CORE_CENTRE.includes(square),
    );
  if (centre)
    return {
      kind: "centre",
      prompt: "Fight for the centre.",
      arrows: [],
      outlines: CORE_CENTRE.map((square) => ({ square, tone: "jade" })),
    };
  return undefined;
}
