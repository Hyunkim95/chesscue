import { Chess, type Move, type Square } from "chess.js";

import type { BoardArrow } from "./board-move-cues";
import { PIECE_VALUE, opponent } from "./board-relations";

// The checks, captures and threats scan: every forcing move for the side to
// move, so a learner can practise looking at them before choosing. It lists
// moves without ranking them, so it does not point at the answer.

export interface Threat {
  readonly move: Move;
  readonly target: Square;
}

export interface ForcingScan {
  readonly checks: readonly Move[];
  readonly captures: readonly Move[];
  // Quiet moves that newly attack an undefended piece or a more valuable one.
  readonly threats: readonly Threat[];
}

export function forcingScan(fen: string): ForcingScan | undefined {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return undefined;
  }
  const checks: Move[] = [];
  const captures: Move[] = [];
  const threats: Threat[] = [];
  for (const move of board.moves({ verbose: true })) {
    const after = new Chess(move.after);
    if (after.inCheck()) checks.push(move);
    if (move.captured) captures.push(move);
    if (after.inCheck() || move.captured) continue;
    const them = opponent(move.color);
    const target = after
      .board()
      .flat()
      .find(
        (piece) =>
          piece?.color === them &&
          piece.type !== "k" &&
          piece.type !== "p" &&
          after.attackers(piece.square, move.color).includes(move.to) &&
          !board.attackers(piece.square, move.color).includes(move.from) &&
          (after.attackers(piece.square, them).length === 0 ||
            PIECE_VALUE[piece.type] > PIECE_VALUE[move.piece]),
      );
    if (target) threats.push({ move, target: target.square });
  }
  return { checks, captures, threats };
}

const SHOWN = 4;
const NAME = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
} as const;

function row(items: readonly string[]): string {
  if (items.length === 0) return "none";
  const shown = items.slice(0, SHOWN).join(", ");
  return items.length > SHOWN
    ? `${shown} and ${String(items.length - SHOWN)} more`
    : shown;
}

export type ScanKind = "check" | "capture" | "threat";

export interface ScanHint {
  readonly rows: readonly {
    readonly kind: ScanKind;
    readonly label: string;
    readonly moves: string;
  }[];
  // One arrow per listed move. A move that is both a check and a capture is
  // drawn once, as a check.
  readonly arrows: readonly BoardArrow[];
}

export function scanHint(fen: string): ScanHint | undefined {
  const scan = forcingScan(fen);
  if (!scan) return undefined;
  const board = new Chess(fen);
  const threats = scan.threats.map(({ move, target }) => {
    const piece = board.get(target);
    return `${move.san} (attacks the ${piece ? NAME[piece.type] : "piece"} on ${target})`;
  });
  const listed: readonly { move: Move; kind: BoardArrow["kind"] }[] = [
    ...scan.checks
      .slice(0, SHOWN)
      .map((move) => ({ move, kind: "scan-check" as const })),
    ...scan.captures
      .slice(0, SHOWN)
      .map((move) => ({ move, kind: "scan-capture" as const })),
    ...scan.threats
      .slice(0, SHOWN)
      .map(({ move }) => ({ move, kind: "scan-threat" as const })),
  ];
  const drawn = new Set<string>();
  const arrows: BoardArrow[] = [];
  for (const { move, kind } of listed) {
    if (drawn.has(move.lan)) continue;
    drawn.add(move.lan);
    arrows.push({ from: move.from, to: move.to, kind });
  }
  return {
    rows: [
      {
        kind: "check",
        label: "Checks",
        moves: row(scan.checks.map(({ san }) => san)),
      },
      {
        kind: "capture",
        label: "Captures",
        moves: row(scan.captures.map(({ san }) => san)),
      },
      { kind: "threat", label: "Threats", moves: row(threats) },
    ],
    arrows,
  };
}
