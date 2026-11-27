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

const PIECE_LETTER: Readonly<Record<string, string>> = {
  king: "K",
  queen: "Q",
  rook: "R",
  bishop: "B",
  knight: "N",
  horse: "N",
  pawn: "P",
};
const PIECE_WORD = /\b(king|queen|rook|bishop|knight|horse|pawn)s?\b/g;
const CAPTURE_WORDS =
  /\b(?:take|takes|taking|took|capture|captures|capturing|captured|grab|grabs|eat|eats)\b/;
// "next to the king", "in front of my pawn": where a piece goes, by what it
// ends up beside, for a player who cannot read the coordinates.
const RELATION =
  /\b(next to|beside|near|by|adjacent to|in front of|behind)\s+(?:the\s+|my\s+|your\s+|his\s+)?(king|queen|rook|bishop|knight|horse|pawn)s?\b/;

function firstPiece(text: string): string | undefined {
  const [word] = [...text.matchAll(PIECE_WORD)].map((match) => match[1]);
  return word ? PIECE_LETTER[word] : undefined;
}

const FILES = "abcdefgh";

// Squares that stand in the named relation to a piece of the given type.
function relatedSquares(
  fen: string,
  relation: string,
  target: string,
): Set<string> {
  const squares = new Set<string>();
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return squares;
  }
  for (const row of board.board())
    for (const cell of row) {
      if (cell?.type.toUpperCase() !== target) continue;
      const file = FILES.indexOf(cell.square[0] ?? "");
      const rank = Number(cell.square[1]);
      const ahead = cell.color === "w" ? 1 : -1;
      const near =
        relation === "in front of"
          ? [[0, ahead]]
          : relation === "behind"
            ? [[0, -ahead]]
            : [
                [-1, -1],
                [-1, 0],
                [-1, 1],
                [0, -1],
                [0, 1],
                [1, -1],
                [1, 0],
                [1, 1],
              ];
      for (const [df = 0, dr = 0] of near) {
        const f = FILES[file + df];
        const r = rank + dr;
        if (f && r >= 1 && r <= 8) squares.add(`${f}${String(r)}`);
      }
    }
  return squares;
}

// Moves described in words, such as "why would the queen take", "why did
// you take my bishop", "knight to f5" or "what if the queen moves next to the
// king": the given moves that match the piece named first (the one moving, or
// for a capture the one taken), a capture or check, any square named, and
// with the position, where the move lands beside another piece. Empty when
// the words describe no move.
export function describedMoves<
  T extends {
    readonly san: string;
    readonly uci?: string;
    readonly captured?: string | undefined;
  },
>(text: string, moves: readonly T[], fen?: string): T[] {
  const lower = text.toLowerCase();
  const relation = RELATION.exec(lower);
  const rest = relation
    ? lower.slice(0, relation.index) +
      lower.slice(relation.index + relation[0].length)
    : lower;
  const piece = firstPiece(rest);
  const capture = CAPTURE_WORDS.test(lower);
  const check = /\bcheck/.test(lower);
  const squares = rest.match(/\b[a-h][1-8]\b/g) ?? [];
  const target = relation?.[2] ? PIECE_LETTER[relation[2]] : undefined;
  const beside =
    relation?.[1] && target && fen
      ? relatedSquares(fen, relation[1], target)
      : undefined;
  if (!piece && !capture && !check && squares.length === 0 && !beside)
    return [];
  return moves.filter(({ san, uci, captured }) => {
    const lead = san.startsWith("O-O")
      ? "K"
      : (/^[KQRBN]/.exec(san)?.[0] ?? "P");
    // "took my bishop" names the piece taken, not the one that moved.
    const taken = captured?.toUpperCase();
    if (piece && lead !== piece && !(capture && taken === piece)) return false;
    if (capture && !san.includes("x")) return false;
    if (check && !/[+#]/.test(san)) return false;
    if (beside && !(uci && beside.has(uci.slice(2, 4)))) return false;
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
