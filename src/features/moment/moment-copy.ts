import { Chess } from "chess.js";

import type { BoardArrow } from "../../domain/analysis/board-move-cues";
import { forcingScan } from "../../domain/analysis/forcing-moves";
import type { FeedbackTier } from "../../domain/session/types";
import type { BoardOutline } from "../board/ChessBoard";

// Rook's words for each tier (design §3.2 and §6): first person, the move and
// its consequence, no engine numbers.
export function tierLine({
  tier,
  trySan,
  replySan,
  preview,
}: {
  readonly tier: FeedbackTier;
  readonly trySan: string;
  readonly replySan: string | undefined;
  readonly preview: boolean;
}): string {
  const answer = replySan ? `I answer ${replySan}. ` : "";
  const lead = preview
    ? `If you play ${trySan}, ${answer.toLowerCase()}`
    : answer;
  switch (tier) {
    case "best":
      return preview
        ? `${lead}${trySan} works.`.trim()
        : `That works. ${answer}`.trim();
    case "missed":
      return `${lead}The position is level, so ${trySan} is playable. But something much stronger was here.`;
    case "worse":
      return `${lead}After ${trySan} I'm a little better. Something much stronger was here.`;
    case "costly":
      return `${lead}${trySan} costs you material.`;
  }
}

const NAME = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
} as const;

function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1) ?? ""}`;
}

export interface BoardAnswer {
  readonly text: string;
  readonly arrows: readonly BoardArrow[];
  readonly outlines: readonly BoardOutline[];
}

// "What are you threatening?": Rook's captures and checks if it were his move.
export function threatsAnswer(fen: string): BoardAnswer {
  const fields = fen.split(" ");
  const flipped = [
    fields[0],
    fields[1] === "w" ? "b" : "w",
    fields[2],
    "-",
    "0",
    "1",
  ].join(" ");
  const scan = (() => {
    try {
      return new Chess(fen).inCheck() ? undefined : forcingScan(flipped);
    } catch {
      return undefined;
    }
  })();
  if (!scan || (scan.captures.length === 0 && scan.checks.length === 0))
    return {
      text: "Nothing right now: none of my pieces can capture or give check.",
      arrows: [],
      outlines: [],
    };
  const board = new Chess(fen);
  const captures = scan.captures.slice(0, 3);
  const targets = captures.map(({ to }) => {
    const piece = board.get(to);
    return `your ${piece ? NAME[piece.type] : "piece"} on ${to}`;
  });
  const checks = scan.checks.filter((move) => !move.captured).slice(0, 2);
  const parts = [
    ...(targets.length > 0 ? [`I could take ${listed(targets)}`] : []),
    ...(checks.length > 0
      ? [`I could check with ${listed(checks.map(({ san }) => san))}`]
      : []),
  ];
  return {
    text: `If it were my move, ${parts.join(", and ")}. Check what guards them before you move.`,
    arrows: [...captures, ...checks].map(({ from, to }) => ({
      from,
      to,
      kind: "reply",
    })),
    outlines: captures.map(({ to }) => ({ square: to, tone: "coral" })),
  };
}

// "Any checks for me?": every check, unranked, so it does not point at the answer.
export function checksAnswer(fen: string): BoardAnswer {
  const checks = forcingScan(fen)?.checks ?? [];
  return {
    text:
      checks.length === 0
        ? "No checks for you here."
        : `You have ${String(checks.length)} ${checks.length === 1 ? "check" : "checks"}: ${listed(checks.map(({ san }) => san))}. Which one does something?`,
    arrows: checks.map(({ from, to }) => ({ from, to, kind: "scan-check" })),
    outlines: [],
  };
}

// "Why {Rook's reply}?": what the reply does, from the board only.
export function replyReason(fen: string, uci: string): string {
  try {
    const board = new Chess(fen);
    const wasInCheck = board.inCheck();
    const move = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    });
    if (move.san.includes("#")) return `${move.san} is checkmate.`;
    if (move.captured)
      return `${move.san} takes your ${NAME[move.captured]} on ${move.to}.`;
    if (wasInCheck) return `${move.san} gets my king out of check.`;
    if (move.san.includes("+")) return `${move.san} gives check.`;
    return `Stockfish rates ${move.san} as my best answer.`;
  } catch {
    return "Play it on the board and I'll show you.";
  }
}
