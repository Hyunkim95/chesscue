import { Chess, SQUARES, type PieceSymbol } from "chess.js";

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

const bare = (move: string) => move.replace(/[+#]$/, "");

export function whyProblems(text: string, packet: WhyPacket): string[] {
  const written = JSON.stringify(packet);
  const found: string[] = [];
  if (text.trim().length === 0) found.push("empty");
  if (text.length > MAX_LENGTH) found.push("too long");

  const known = new Set((written.match(MOVE) ?? []).map(bare));
  for (const move of new Set(text.match(MOVE) ?? []))
    if (!known.has(bare(move))) found.push(`move ${move}`);

  // A piece on a square must be in the packet or on the board before or
  // after the best move.
  const boards = [new Chess(packet.fen)];
  const after = new Chess(packet.fen);
  after.move(packet.bestMove);
  boards.push(after);
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
  if (/\bforced\b|\bforces\b/i.test(text) && !written.includes("checkmate"))
    found.push("forced");
  if (
    /\bfree\b/i.test(text) &&
    (packet.bestMoveCaptures?.canTakeBack.length ?? 1) > 0
  )
    found.push("free");

  const pinners = (packet.bestMoveCaptures?.attackersThatArePinned ?? [])
    .map(({ pinnedBy }) => pinnedBy)
    .filter((pinnedBy) => pinnedBy !== null);
  if (/pinned by|\bpins?\b/i.test(text) && pinners.length === 0)
    found.push("pin");
  for (const [, piece = ""] of text.matchAll(
    /pinned by (?:your |the |a |their |his |her )?(king|queen|rook|bishop|knight|pawn)/gi,
  ))
    if (!pinners.some((pinnedBy) => pinnedBy.startsWith(piece.toLowerCase())))
      found.push(`pinned by ${piece}`);
  return found;
}
