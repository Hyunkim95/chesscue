import { Chess, type Move } from "chess.js";

// Routes a learner's message during exploration. Gemini Nano chooses only the
// intent; it routed 30/30 test messages correctly but misread three of eight
// moves described in words (research_notes/rook-intent-spike). So the move
// comes from the board or from legal written notation in the message, and
// Rook asks for the move on the board when neither is available.

export const explorationIntents = [
  "why",
  "what-if",
  "show",
  "hint",
  "reflect",
  "other",
] as const;

export type ExplorationIntent = (typeof explorationIntents)[number];

export type ExplorationRoute =
  | { readonly kind: "why" | "what-if"; readonly move: Move }
  | {
      readonly kind: "play-it-on-the-board";
      readonly intent: "why" | "what-if";
    }
  | { readonly kind: "show" | "hint" | "reflect" | "other" };

const NOTATION =
  /\b(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8](?:=[QRBN])?)[+#]?/g;
const bare = (san: string) => san.replace(/[+#]/g, "");

// The first legal move written in standard notation in the message.
export function writtenMove(text: string, fen: string): Move | undefined {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return undefined;
  }
  const legal = board.moves({ verbose: true });
  for (const token of text.match(NOTATION) ?? []) {
    const move = legal.find(({ san }) => bare(san) === bare(token));
    if (move) return move;
  }
  return undefined;
}

// The first of the given moves written in the message, such as a move
// already played in a line the learner is stepping through.
export function mentionedMove<T extends { readonly san: string }>(
  text: string,
  moves: readonly T[],
): T | undefined {
  for (const token of text.match(NOTATION) ?? []) {
    const move = moves.find(({ san }) => bare(san) === bare(token));
    if (move) return move;
  }
  return undefined;
}

const PIECE_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\bkings?\b/, "K"],
  [/\bqueens?\b/, "Q"],
  [/\brooks?\b/, "R"],
  [/\bbishops?\b/, "B"],
  [/\b(?:knights?|horses?)\b/, "N"],
  [/\bpawns?\b/, "P"],
];
const CAPTURE_WORDS =
  /\b(?:take|takes|taking|took|capture|captures|capturing|captured|grab|grabs|eat|eats)\b/;

// Moves described in words, such as "why would the queen take" or "knight to
// f5": the given moves that match the piece named, a capture or check, and
// any square named. Empty when the words describe no move.
export function describedMoves<T extends { readonly san: string }>(
  text: string,
  moves: readonly T[],
): T[] {
  const lower = text.toLowerCase();
  const piece = PIECE_WORDS.find(([words]) => words.test(lower))?.[1];
  const capture = CAPTURE_WORDS.test(lower);
  const check = /\bcheck/.test(lower);
  const squares = lower.match(/\b[a-h][1-8]\b/g) ?? [];
  if (!piece && !capture && !check && squares.length === 0) return [];
  return moves.filter(({ san }) => {
    const lead = san.startsWith("O-O")
      ? "K"
      : (/^[KQRBN]/.exec(san)?.[0] ?? "P");
    if (piece && lead !== piece) return false;
    if (capture && !san.includes("x")) return false;
    if (check && !/[+#]/.test(san)) return false;
    return (
      squares.length === 0 || squares.some((square) => san.includes(square))
    );
  });
}

export function routeExploration(input: {
  readonly intent: ExplorationIntent;
  readonly text: string;
  readonly fen: string;
  // A move the learner has just played or selected on the board.
  readonly boardMove?: Move | undefined;
}): ExplorationRoute {
  const { intent } = input;
  if (intent !== "why" && intent !== "what-if") return { kind: intent };
  const move = writtenMove(input.text, input.fen) ?? input.boardMove;
  return move
    ? { kind: intent, move }
    : { kind: "play-it-on-the-board", intent };
}
