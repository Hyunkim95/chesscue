import { Chess, SQUARES } from "chess.js";

import type { BoardArrow } from "../../domain/analysis/board-move-cues";
import {
  opponent,
  staticExchange,
} from "../../domain/analysis/board-relations";
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
  plan = false,
}: {
  readonly tier: FeedbackTier;
  readonly trySan: string;
  readonly replySan: string | undefined;
  readonly preview: boolean;
  // A plan position has a stated goal rather than one winning move.
  readonly plan?: boolean;
}): string {
  const stronger = plan
    ? "Something does more for your goal here."
    : "But something much stronger was here.";
  const answer = replySan ? `I answer ${replySan}. ` : "";
  const lead = preview
    ? replySan
      ? `If you play ${trySan}, I answer ${replySan}. `
      : `If you play ${trySan}, `
    : answer;
  switch (tier) {
    case "best":
      return preview
        ? `${lead}${trySan} works.`.trim()
        : `That works. ${answer}`.trim();
    case "missed":
      return `${lead}The position is level, so ${trySan} is playable. ${stronger}`;
    case "worse":
      return `${lead}After ${trySan} I'm a little better. ${stronger.replace("But s", "S")}`;
    // Stockfish's evaluation says the position is lost, not why, so the
    // words claim no material.
    case "costly":
      return `${lead}After ${trySan} I'm winning. ${stronger.replace("But s", "S")}`;
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

// What one of Rook's moves does that the board shows plainly: a mate, a
// capture, a check or an escape from check. Undefined for a quiet move.
function playUci(board: Chess, uci: string) {
  return board.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
  });
}

// Why Rook could take: a recapture, a piece left with no defender (and the
// player's move that left it so), or an exchange that still comes out ahead.
// `previous` is the player's move just before, from the position it was
// played in.
// What a line comes to for the side that moves first, in points: material
// won minus material lost over the line. Undefined when it cannot be played.
function lineNet(fen: string, line: readonly string[]): number | undefined {
  try {
    const board = new Chess(fen);
    const side = board.turn();
    let net = 0;
    for (const uci of line) {
      const move = playUci(board, uci);
      if (move.captured)
        net += (move.color === side ? 1 : -1) * VALUE[move.captured];
    }
    return net;
  } catch {
    return undefined;
  }
}

// Why Rook could take: a recapture, a piece left with no defender (and the
// player's move that left it so), or an exchange that still comes out ahead.
// "…so I take it" is said only when Stockfish's line from the capture backs
// it: Rook comes out ahead. Without the line, only the board fact is said;
// with a line that does not back it, nothing, so a search can explain it.
function captureReason(
  fen: string,
  uci: string,
  previous: { readonly fen: string; readonly uci: string } | undefined,
  rest: readonly string[],
): string | undefined {
  const board = new Chess(fen);
  const to = SQUARES.find((square) => square === uci.slice(2, 4));
  const target = to ? board.get(to) : undefined;
  if (!to || !target) return undefined;
  const name = `your ${NAME[target.type]} on ${to}`;
  const rookSide = opponent(target.color);
  const net = rest.length > 0 ? lineNet(fen, [uci, ...rest]) : undefined;
  const backed = net !== undefined && net > 0;
  const known = rest.length > 0;
  if (previous) {
    const before = new Chess(previous.fen);
    const theirs = playUci(new Chess(previous.fen), previous.uci);
    if (theirs.to === to && theirs.captured) return `I take back on ${to}.`;
    const defended = board.attackers(to, target.color).length > 0;
    if (!defended) {
      if (theirs.to === to)
        return backed
          ? `${theirs.san} puts your ${NAME[target.type]} on ${to}, where nothing defends it, so I take it.`
          : known
            ? undefined
            : `${theirs.san} puts your ${NAME[target.type]} on ${to}, where nothing defends it.`;
      const was = before.get(to);
      if (
        was?.type === target.type &&
        before.attackers(to, target.color).length > 0
      )
        return backed
          ? `${theirs.san} took away the last defender of ${name}, so I take it.`
          : known
            ? undefined
            : `${theirs.san} took away the last defender of ${name}.`;
    }
  }
  if (board.attackers(to, target.color).length === 0)
    return backed
      ? `Nothing defends ${name}, so I take it for free.`
      : known
        ? undefined
        : `Nothing defends ${name}.`;
  if (backed && staticExchange(board, to, rookSide) > 0)
    return `Even after you take back on ${to}, I come out ahead.`;
  return undefined;
}

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as const;
const COUNT = ["", "a", "two", "three", "four"];

function pieceWords(pieces: readonly (keyof typeof NAME)[]): string {
  const counts = new Map<keyof typeof NAME, number>();
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  const parts = [...counts]
    .toSorted(([a], [b]) => VALUE[b] - VALUE[a])
    .map(([piece, count]) =>
      count === 1
        ? `a ${NAME[piece]}`
        : `${COUNT[count] ?? String(count)} ${NAME[piece]}s`,
    );
  return parts.length <= 1
    ? parts.join("")
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
}

// A capture of a defended piece: what the rest of the line comes to. "Nxc5
// starts a line where I win a bishop and a pawn for a knight." or, for an
// even exchange, "Nxc5 trades my knight for your bishop."
function lineReason(fen: string, line: readonly string[]): string | undefined {
  const board = new Chess(fen);
  const rook = board.turn();
  const won: (keyof typeof NAME)[] = [];
  const lost: (keyof typeof NAME)[] = [];
  let first: { san: string; piece: keyof typeof NAME } | undefined;
  for (const uci of line) {
    const move = playUci(board, uci);
    first ??= { san: move.san, piece: move.piece };
    if (!move.captured) continue;
    (move.color === rook ? won : lost).push(move.captured);
  }
  if (!first) return undefined;
  const worth = (pieces: readonly (keyof typeof NAME)[]) =>
    pieces.reduce((sum, piece) => sum + VALUE[piece], 0);
  if (line.length > 2 && worth(won) > worth(lost))
    return lost.length === 0
      ? `${first.san} starts a line where I win ${pieceWords(won)}.`
      : `${first.san} starts a line where I win ${pieceWords(won)} for ${pieceWords(lost)}.`;
  const [taken] = won;
  if (taken && worth(won) === worth(lost))
    return `${first.san} trades my ${NAME[first.piece]} for your ${NAME[taken]}.`;
  return undefined;
}

// A capture's reason from the board alone, or none when only a search can
// say why (the capture gives up material).
export function captureReasonFromBoard(
  fen: string,
  uci: string,
  previous?: { readonly fen: string; readonly uci: string },
  rest: readonly string[] = [],
): string | undefined {
  try {
    return (
      captureReason(fen, uci, previous, rest) ?? lineReason(fen, [uci, ...rest])
    );
  } catch {
    return undefined;
  }
}

// What a line costs and wins Rook, who moves first: "So I take your bishop
// instead. It costs me a queen, but I get a bishop and a knight for her."
export function sacrificeSentence(
  fen: string,
  line: readonly string[],
): string | undefined {
  try {
    const board = new Chess(fen);
    const rook = board.turn();
    const won: (keyof typeof NAME)[] = [];
    const lost: (keyof typeof NAME)[] = [];
    let first:
      | { piece: keyof typeof NAME; captured?: keyof typeof NAME }
      | undefined;
    for (const uci of line) {
      const move = playUci(board, uci);
      first ??= {
        piece: move.piece,
        ...(move.captured ? { captured: move.captured } : {}),
      };
      if (move.captured) (move.color === rook ? won : lost).push(move.captured);
    }
    if (!first?.captured || lost.length === 0) return undefined;
    const own = first.piece === "q" ? "her" : "it";
    return `So I take your ${NAME[first.captured]} instead. It costs me ${pieceWords(lost)}, but I get ${pieceWords(won)} for ${own}.`;
  } catch {
    return undefined;
  }
}

export function rookMoveReason(
  fen: string,
  uci: string,
  previous?: { readonly fen: string; readonly uci: string },
  // The rest of the line after this move, when it is part of one.
  rest: readonly string[] = [],
): string | undefined {
  try {
    const board = new Chess(fen);
    const wasInCheck = board.inCheck();
    const forced = board.moves().length === 1;
    const move = playUci(board, uci);
    if (move.san.includes("#")) return `${move.san} is checkmate.`;
    if (move.captured)
      return (
        captureReason(fen, uci, previous, rest) ??
        lineReason(fen, [uci, ...rest]) ??
        `${move.san} takes your ${NAME[move.captured]} on ${move.to}.`
      );
    if (forced) return `${move.san} is my only legal move.`;
    if (wasInCheck) return `${move.san} gets my king out of check.`;
    if (move.san.includes("+")) return `${move.san} gives check.`;
    return undefined;
  } catch {
    return undefined;
  }
}

// "Why {Rook's reply}?": what the reply does, from the board only.
export function replyReason(
  fen: string,
  uci: string,
  previous?: { readonly fen: string; readonly uci: string },
): string {
  const reason = rookMoveReason(fen, uci, previous);
  if (reason) return reason;
  try {
    const san = new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    }).san;
    return `Stockfish rates ${san} as my best answer.`;
  } catch {
    return "Play it on the board and I'll show you.";
  }
}

// After a try whose cost the line shows only in Stockfish's evaluation.
export const STANDING_AFTER = {
  missed: "level",
  worse: "better",
  costly: "winning",
} as const;
