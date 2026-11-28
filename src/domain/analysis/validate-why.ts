import { Chess, SQUARES, type PieceSymbol } from "chess.js";

import type { PositionPacket } from "./position-packet";
import type { WhyPacket } from "./why-packet";

// What is wrong with a written "why" before it may be shown. Any problem
// means the code-written caption is shown instead. The checks follow the
// round 1 failures in research_notes/why-explanations/scorecard.md: moves or
// pieces not in the packet, counts the writer worked out itself, a wrong
// pinning piece, and claims of "unstoppable", "forced" or "free".
const MOVE =
  /\b(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|[a-h][1-8](?:=[QRBN])?)[+#]?/g;
const PIECE_ON = /\b(king|queen|rook|bishop|knight|pawn) on ([a-h][1-8])\b/g;
const LETTER: Readonly<Record<string, PieceSymbol>> = {
  king: "k",
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  pawn: "p",
};
const NUMBER = String.raw`\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten`;
const COUNT = new RegExp(
  String.raw`\b(?:${NUMBER}) (?:full )?(?:points?|pawns?)\b(?: of material)?(?: (?:ahead|behind))?`,
  "gi",
);
const MAX_LENGTH = 400;
const PIECE_WORD: Readonly<Record<string, string>> = {
  K: "king",
  Q: "queen",
  R: "rook",
  B: "bishop",
  N: "knight",
};

const bare = (move: string) => move.replace(/[+#]$/, "");

export function whyProblems(text: string, packet: WhyPacket): string[] {
  const after = new Chess(packet.fen);
  after.move(packet.bestMove);
  const pinners = (packet.bestMoveCaptures?.attackersThatArePinned ?? [])
    .map(({ pinnedBy }) => pinnedBy)
    .filter((pinnedBy) => pinnedBy !== null);
  return [
    ...problems(text, {
      written: JSON.stringify(packet),
      boards: [new Chess(packet.fen), after],
      canTakeBack: packet.bestMoveCaptures?.canTakeBack.length ?? 1,
      pinners,
    }),
    ...skippedBestDefence(text, packet),
  ];
}

// The defences come best first. Naming a weaker one, such as a blunder that
// loses material, without the best one makes the move look better than it is.
function skippedBestDefence(text: string, packet: WhyPacket): string[] {
  const [best, ...weaker] = packet.opponentDefences;
  if (!best) return [];
  const named = new Set((text.match(MOVE) ?? []).map(bare));
  if (named.has(bare(best.defence))) return [];
  return weaker
    .filter(({ defence }) => named.has(bare(defence)))
    .map(({ defence }) => `defence ${defence} without ${best.defence}`);
}

// An answer to an open question: the same checks on the current board.
// While solving the packet names none of the player's moves, so any move of
// theirs in the answer is rejected.
export function positionProblems(
  text: string,
  packet: PositionPacket,
  context: unknown = null,
): string[] {
  const boards = [new Chess(packet.fen)];
  if (packet.bestMove) {
    const after = new Chess(packet.fen);
    try {
      after.move(packet.bestMove.move);
      boards.push(after);
    } catch {
      // The packet's move was checked when it was built.
    }
  }
  return problems(text, {
    written: JSON.stringify({ packet, context }),
    boards,
    canTakeBack: 1,
    pinners: [],
  });
}

function problems(
  text: string,
  {
    written,
    boards,
    canTakeBack,
    pinners,
  }: {
    readonly written: string;
    readonly boards: readonly Chess[];
    readonly canTakeBack: number;
    readonly pinners: readonly string[];
  },
): string[] {
  const found: string[] = [];
  if (text.trim().length === 0) found.push("empty");
  if (text.length > MAX_LENGTH) found.push("too long");

  const known = new Set((written.match(MOVE) ?? []).map(bare));
  for (const move of new Set(text.match(MOVE) ?? []))
    if (!known.has(bare(move))) found.push(`move ${move}`);

  // A piece on a square must be in the packet or on one of the boards.
  for (const [, piece = "", square = ""] of text.matchAll(PIECE_ON)) {
    const on = SQUARES.find((value) => value === square);
    if (
      !written.includes(`${piece} on ${square}`) &&
      !boards.some((board) => on && board.get(on)?.type === LETTER[piece])
    )
      found.push(`${piece} on ${square}`);
  }

  // A count must be one of the packet's fragments, written the same way.
  for (const [phrase] of text.matchAll(COUNT)) {
    const exact = /^(\d+) points? (ahead|behind)$/.exec(phrase.trim());
    const [, n = "", side = ""] = exact ?? [];
    if (
      !exact ||
      !written.includes(`"${n} point${n === "1" ? "" : "s"} ${side}"`)
    )
      found.push(`count ${phrase.trim()}`);
  }
  if (
    /\b(?:piece|rook|queen) ahead|full (?:piece|rook)|up a (?:piece|rook|queen)|\bpawns? (?:up|ahead)/i.test(
      text,
    )
  )
    found.push("own count");

  if (/unstoppable/i.test(text)) found.push("unstoppable");
  if (
    /\bforced\b|\bforces\b/i.test(text) &&
    !written.includes("checkmate") &&
    !written.includes("forced mate")
  )
    found.push("forced");
  if (/\bfree\b/i.test(text) && canTakeBack > 0) found.push("free");

  // A pin is checked when the packet names its pinning piece, or when one of
  // the board's own captions says a move pins ("I play Re8, pinning …").
  const pinning = [
    ...pinners,
    ...[...written.matchAll(/"pinnedBy":"(\w+) on/g)].map(
      ([, piece = ""]) => piece,
    ),
    ...[
      ...written.matchAll(
        /\b([KQRBN])[a-h]?[1-8]?x?[a-h][1-8][+#]?,? pin(?:s|ning)\b/g,
      ),
    ].map(([, letter = ""]) => PIECE_WORD[letter] ?? ""),
    // A line-up with a king behind is a pin by the moving piece.
    ...(written.includes('"behind":"king on') ? ["line"] : []),
  ].filter((piece) => piece !== "");
  if (/pinned by|\bpins?\b|\bpinning\b/i.test(text) && pinning.length === 0)
    found.push("pin");
  for (const [, piece = ""] of text.matchAll(
    /pinned by (?:your |the |a |their |his |her |my )?(king|queen|rook|bishop|knight|pawn)/gi,
  ))
    if (!pinning.some((pinnedBy) => pinnedBy.startsWith(piece.toLowerCase())))
      found.push(`pinned by ${piece}`);
  return found;
}
