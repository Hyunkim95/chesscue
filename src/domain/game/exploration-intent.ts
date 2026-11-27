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
