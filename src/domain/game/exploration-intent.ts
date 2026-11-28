import { Chess, SQUARES, type Move, type PieceSymbol } from "chess.js";

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

const PIECE = "(king|queen|rook|bishop|knight|horse|pawn)s?";
const OWNER = "(?:the |my |your |his |her |a |that |this )?";
const LOWER_NOTATION =
  /\b(?:o-o(?:-o)?|[kqrbn][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[qrbn])?|[a-h][1-8](?:=[qrbn])?)[+#]?(?![a-z0-9])/g;
const CENTRE = new Set(["d4", "e4", "d5", "e5"]);
const lead = (move: Move) =>
  move.san.startsWith("O-O") ? "K" : (/^[KQRBN]/.exec(move.san)?.[0] ?? "P");

// The legal moves a player means by their words, for "what if" and "why
// not" in any wording: notation in any case ("qh5", "Nf6"), a piece and a
// square ("knight f6", "queen to h5"), a pawn by its file ("push the h pawn",
// "two squares"), a square a piece stands on ("my a1 rook", "from g8 to
// f6"), a file or the centre ("to the d file", "to the middle"), what is
// taken and with what ("take the pawn with my queen"), what it attacks
// ("attack the bishop"), what it lands beside, check and castling. Code
// reads the words, so the move is always legal; more than one means the
// words fit several. Empty when the words describe no move.
export function movesInWords(text: string, fen: string): Move[] {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return [];
  }
  const legal = board.moves({ verbose: true });
  const lower = text.toLowerCase().replace(/[’']/g, "");
  if (/\bcastl/.test(lower)) {
    const long = /\b(?:queen ?side|long)\b/.test(lower);
    const short = /\b(?:king ?side|short)\b/.test(lower);
    return legal.filter(({ san }) =>
      long
        ? san.startsWith("O-O-O")
        : short
          ? /^O-O(?!-O)/.test(san)
          : san.startsWith("O-O"),
    );
  }

  // What the piece attacks and what it lands beside are about other pieces:
  // read them first, so they are not taken for the piece that moves.
  const attackMatch = new RegExp(
    `\\battack(?:s|ing)?\\s+${OWNER}${PIECE}`,
  ).exec(lower);
  const relation = RELATION.exec(lower);
  let rest = lower;
  for (const match of [attackMatch, relation])
    if (match) rest = rest.replace(match[0], " ");
  const withMatch = new RegExp(`\\bwith\\s+${OWNER}${PIECE}`).exec(rest);
  const takenMatch = new RegExp(
    `\\b(?:take|takes|taking|capture|captures|grab|grabs|eat|eats)\\s+${OWNER}${PIECE}`,
  ).exec(rest);
  const filePawn = /\b([a-h])[- ]?pawn\b/.exec(rest);
  const mover = withMatch?.[1]
    ? PIECE_LETTER[withMatch[1]]
    : filePawn
      ? "P"
      : undefined;
  const taken = takenMatch?.[1] ? PIECE_LETTER[takenMatch[1]] : undefined;
  let named = rest;
  for (const match of [withMatch, takenMatch])
    if (match) named = named.replace(match[0], " ");
  const piece = mover ?? firstPiece(named);
  const capture = CAPTURE_WORDS.test(lower);
  const check = /\bcheck/.test(lower);
  const twoSquares = /\btwo (?:squares|steps|spaces)\b/.test(lower);
  const toFile = /\b([a-h])[- ]file\b/.exec(lower)?.[1];
  const centre = /\b(?:middle|centre|center)\b/.test(lower);
  const target = attackMatch?.[1] ? PIECE_LETTER[attackMatch[1]] : undefined;
  const beside =
    relation?.[1] && relation[2]
      ? relatedSquares(fen, relation[1], PIECE_LETTER[relation[2]] ?? "")
      : undefined;

  // Written notation. A bare square ("f6") is a pawn move only when nothing
  // else in the words says which piece moves.
  const tokens = rest.match(LOWER_NOTATION) ?? [];
  const bareSquare = (token: string) => /^[a-h][1-8]$/.test(token);
  const written = tokens
    .filter((token) => !bareSquare(token))
    .flatMap((token) =>
      legal.filter(
        ({ san }) => bare(san).toLowerCase() === bare(token).toLowerCase(),
      ),
    );
  if (written.length > 0) {
    const fits = written.filter(
      (move) => !piece || lead(move) === piece || piece === "P",
    );
    return [...new Set(fits.length > 0 ? fits : written)];
  }

  // Squares: one the moving side stands on is where the piece comes from;
  // any other is where it goes. "from" and "to" say so outright.
  const squares = (rest.match(/\b[a-h][1-8]\b/g) ?? []).filter(
    (square) => square !== filePawn?.[0],
  );
  const own = (name: string) => {
    const square = SQUARES.find((known) => known === name);
    return square !== undefined && board.get(square)?.color === board.turn();
  };
  const fromWord = /\bfrom\s+([a-h][1-8])\b/.exec(rest)?.[1];
  const froms = squares.filter(
    (square) => square === fromWord || (square !== fromWord && own(square)),
  );
  const tos = squares.filter((square) => !froms.includes(square));
  if (
    !piece &&
    !capture &&
    !check &&
    squares.length === 0 &&
    !toFile &&
    !centre &&
    !target &&
    !beside &&
    !taken
  )
    return [];
  if (squares.length === 1 && !piece && tos.length === 1 && !capture) {
    const pawn = legal.filter(
      (move) => lead(move) === "P" && move.to === tos[0],
    );
    if (pawn.length > 0) return pawn;
  }
  return legal.filter((move) => {
    if (
      piece &&
      lead(move) !== piece &&
      !(capture && !mover && move.captured?.toUpperCase() === piece)
    )
      return false;
    if (taken && move.captured?.toUpperCase() !== taken) return false;
    if (capture && !move.captured) return false;
    if (check && !/[+#]/.test(move.san)) return false;
    if (filePawn?.[1] && !move.from.startsWith(filePawn[1])) return false;
    if (twoSquares && Math.abs(Number(move.to[1]) - Number(move.from[1])) !== 2)
      return false;
    if (froms.length > 0 && !froms.includes(move.from)) return false;
    if (tos.length > 0 && !tos.includes(move.to)) return false;
    if (toFile && !move.to.startsWith(toFile)) return false;
    if (centre && !CENTRE.has(move.to)) return false;
    if (beside && !beside.has(move.to)) return false;
    if (target && !attacksNew(fen, move, target)) return false;
    return true;
  });
}

const PIECE_TYPES: readonly PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];

// Whether the move leaves the moved piece attacking an opponent piece of
// the given type that it did not attack before.
function attacksNew(fen: string, move: Move, target: string): boolean {
  const after = new Chess(move.after);
  const them = move.color === "w" ? "b" : "w";
  const type = PIECE_TYPES.find((known) => known === target.toLowerCase());
  if (!type) return false;
  return after.findPiece({ type, color: them }).some((square) => {
    const by = after.attackers(square, move.color);
    if (!by.includes(move.to)) return false;
    const before = new Chess(fen);
    return !before.attackers(square, move.color).includes(move.from);
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
