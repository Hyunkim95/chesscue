import type { Chess, Move } from "chess.js";

const pieceByName = {
  pawn: "p",
  knight: "n",
  bishop: "b",
  rook: "r",
  queen: "q",
} as const;

export function rookCaptureAnswer(
  question: string,
  position: Chess,
  hiddenReply?: Move,
): string | undefined {
  const mentioned =
    /\b(?:takes?|captures?)\s+(?:(?:the|a|my|your|our|white|black)\s+)*(pawn|knight|bishop|rook|queen)\b/i.exec(
      question,
    );
  if (!mentioned?.[1]) return undefined;
  const name = mentioned[1].toLowerCase();
  const piece = Object.entries(pieceByName).find(([key]) => key === name)?.[1];
  const subject = /\b(white|black)\b/i
    .exec(question.slice(0, mentioned.index))?.[1]
    ?.toLowerCase();
  const turn = position.turn();
  const side = turn === "w" ? "White" : "Black";
  if (subject && subject !== side.toLowerCase()) {
    return `It’s ${side}’s turn. ${subject === "white" ? "White" : "Black"} can only make that capture on their turn.`;
  }
  const targetSide = turn === "w" ? "Black" : "White";
  const target = /^\s+(?:on|at)\s+([a-h][1-8])\b/i
    .exec(question.slice(mentioned.index + mentioned[0].length))?.[1]
    ?.toLowerCase();
  const captures = position
    .moves({ verbose: true })
    .filter(
      (move) =>
        move.captured === piece && (target === undefined || move.to === target),
    );
  const first = captures[0];
  if (!first)
    return `${side} can’t legally capture a ${targetSide} ${name} from this position.`;
  if (hiddenReply) {
    const found = captures.some(({ lan }) => lan === hiddenReply.lan);
    return found
      ? `Yes. Stockfish found a ${name} capture for ${side}. Try it on the board.`
      : `${side} can take the ${name}. Stockfish found a different reply. Try the capture or use Show reply to compare.`;
  }
  return captures.length === 1
    ? `Yes. ${side} can take the ${name} on ${first.to} with ${first.san}.`
    : `Yes. ${side} can take a ${name} with ${captures.map(({ san }) => san).join(" or ")}.`;
}
