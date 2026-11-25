import {
  Chess,
  SQUARES,
  validateFen,
  type Square,
  type PieceSymbol,
  type Color,
} from "chess.js";
import { z } from "zod";
import { courses, type StudyLesson } from "./roadmap";

export const cutoffFen = "8/6k1/3r4/6p1/8/8/K6P/7R w - - 0 1";
export const studyPositionSchema = z
  .string()
  .trim()
  .max(120)
  .refine(isStudyPosition);
export function isStudyPosition(fen: string): boolean {
  try {
    if (fen.split(/\s+/).length !== 6 || !validateFen(fen).ok) return false;
    const board = new Chess(fen);
    const previous = board.turn() === "w" ? "b" : "w";
    const pieces = board
      .board()
      .flatMap((row) => row.filter((p) => p !== null));
    const king = pieces.find((p) => p.color === previous && p.type === "k");
    return (
      king !== undefined &&
      !board.isAttacked(king.square, board.turn()) &&
      ["w", "b"].every(
        (color) =>
          pieces.filter((p) => p.color === color).length <= 16 &&
          pieces.filter((p) => p.type === "p" && p.color === color).length <= 8,
      )
    );
  } catch {
    return false;
  }
}
export function square(value: string): Square | null {
  return SQUARES.find((s) => s === value) ?? null;
}
export function editPosition(
  fen: string,
  from: string,
  to: string,
): string | null {
  const origin = square(from),
    destination = square(to);
  if (!origin || !destination || origin === destination) return null;
  const board = new Chess(fen),
    piece = board.get(origin);
  if (!piece || board.get(destination)) return null;
  board.remove(origin);
  if (!board.put(piece, destination)) return null;
  const placement = board.fen().split(" ")[0];
  if (!placement) return null;
  const updated = placement + " " + board.turn() + " - - 0 1";
  return isStudyPosition(updated) ? updated : null;
}

const pieceCodes: Readonly<Record<string, PieceSymbol>> = {
  king: "k",
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  pawn: "p",
};
interface Placement {
  color: Color;
  type: PieceSymbol;
  at: Square;
}
function namedPieces(words: string): Placement[] {
  const pieces: Placement[] = [];
  for (const m of words
    .toLowerCase()
    .matchAll(
      /\b(white|black)\s+(king|queen|rook|bishop|knight|pawn)\s+(?:(?:on|at|to)\s+)?([a-h][1-8])\b/g,
    )) {
    const type = pieceCodes[m[2] ?? ""],
      at = square(m[3] ?? "");
    if (type && at)
      pieces.push({ color: m[1] === "white" ? "w" : "b", type, at });
  }
  return pieces;
}
// Exact squares supplied by the player take precedence over an inferred layout.
export function buildRequestedSetup(
  layout: string,
  message: string,
): string | null {
  const requested = namedPieces(message),
    proposed = namedPieces(layout);
  const pieces = [
    ...requested,
    ...proposed.filter(
      (p) => !requested.some((r) => r.color === p.color && r.type === p.type),
    ),
  ];
  if (new Set(pieces.map((p) => p.at)).size !== pieces.length) return null;
  if (
    ["w", "b"].some(
      (c) => pieces.filter((p) => p.type === "k" && p.color === c).length !== 1,
    )
  )
    return null;
  if (
    /rook (?:endgame|ending)/i.test(message) &&
    (pieces.some((p) => !["k", "r", "p"].includes(p.type)) ||
      !pieces.some((p) => p.type === "r"))
  )
    return null;
  const board = new Chess();
  board.clear();
  for (const p of pieces) {
    if (!board.put({ type: p.type, color: p.color }, p.at)) return null;
  }
  const turn = /black to (?:move|play)/i.test(message) ? "b" : "w";
  const fen = [board.fen().split(" ")[0], turn, "-", "-", "0", "1"].join(" ");
  return isStudyPosition(fen) ? fen : null;
}
export const cutoffLayout =
  "white king on a2, white rook on h1, white pawn on h2, black king on g7, black rook on d6, black pawn on g5";
export const intentSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup"), fen: studyPositionSchema }),
  z.object({
    action: z.literal("edit"),
    from: z.string().regex(/^[a-h][1-8]$/),
    to: z.string().regex(/^[a-h][1-8]$/),
  }),
  z.object({
    action: z.literal("answer"),
    answer: z.string().trim().min(1).max(550),
  }),
]);
export type StudyIntent = z.infer<typeof intentSchema>;
export interface StudyTurn {
  speaker: "You" | "Gemini Nano" | "Study library";
  text: string;
}
export interface BoardFacts {
  side: string;
  pieces: string;
  legalMoves: string[];
  engineLine: string[];
  status: string;
  squareControl: string[];
}
export function boardFacts(
  fen: string,
  line: readonly string[],
  question = "",
): BoardFacts {
  const board = new Chess(fen),
    pieces = board
      .board()
      .flat()
      .flatMap((p) => (p ? [p.color + p.type + "@" + p.square] : []));
  const facts = {
    squareControl: [
      ...new Set(question.toLowerCase().match(/\b[a-h][1-8]\b/g) ?? []),
    ].flatMap((value) => {
      const target = square(value);
      if (!target) return [];
      return (["w", "b"] as const).map((color) => {
        const locations = board.attackers(target, color);
        const side = color === "w" ? "White" : "Black";
        const names: Record<PieceSymbol, string> = {
          r: "rook",
          b: "bishop",
          n: "knight",
          q: "queen",
          p: "pawn",
          k: "king",
        };
        const pieces = locations.flatMap((from) => {
          const piece = board.get(from);
          return piece ? [names[piece.type] + " on " + from] : [];
        });
        return pieces.length
          ? side +
              " covers " +
              target +
              " with the " +
              pieces.join(" and the ") +
              "."
          : "No " + side.toLowerCase() + " piece covers " + target + ".";
      });
    }),
    side: board.turn() === "w" ? "White" : "Black",
    pieces: pieces.join(" "),
    legalMoves: board.moves(),
    engineLine: [] as string[],
    status: board.isCheckmate()
      ? "checkmate"
      : board.isDraw()
        ? "draw"
        : board.inCheck()
          ? "check"
          : "in play",
  };
  for (const uci of line) {
    const move = board.moves({ verbose: true }).find((m) => m.lan === uci);
    if (!move) break;
    facts.engineLine.push(board.move(move.san).san);
  }
  return facts;
}
// Keep model wording qualitative. Moves and evaluations are rendered from the board and engine.
export function validStudyAnswer(text: string, facts: BoardFacts): boolean {
  const known = [
    facts.pieces,
    ...facts.squareControl,
    ...facts.engineLine,
  ].join(" ");
  const refs = text.match(/\b[a-h][1-8]\b/gi) ?? [];
  if (refs.some((ref) => !known.includes(ref.toLowerCase()))) return false;
  const moves =
    text.match(
      /\b(?:[KQRBN][a-h1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8]|O-O(?:-O)?)[+#]?/g,
    ) ?? [];
  if (moves.some((move) => !facts.engineLine.includes(move))) return false;
  text = text.replace(/(?:[KQRBN][a-h1-8]?x?|[a-h]x)?[a-h][1-8][+#]?/g, "");
  return !/[<>]|https?:|\b[a-h][1-8]|\b(?:[KQRBN]x?[a-h]?[1-8]|O-O)|[+#=]|\d|\b(?:forced mate|mate in|is winning|wins by|is losing|is drawn|best move is)\b/i.test(
    text,
  );
}
export function localIntent(
  message: string,
  fen: string,
  lesson: StudyLesson,
  facts: BoardFacts,
): StudyIntent {
  const q = message.trim().toLowerCase();
  const explicit = message.trim().replace(/^fen\s*[: ]\s*/i, "");
  if (
    /(?:set up|setup|create|build|show me|give me)/.test(q) &&
    namedPieces(q).length
  ) {
    const setup = buildRequestedSetup(
      /rook (?:endgame|ending)/.test(q) ? cutoffLayout : "",
      message,
    );
    if (setup) return { action: "setup", fen: setup };
    return {
      action: "answer",
      answer:
        "Please specify a square for each king and the pieces you want on the board. The requested setup could not be validated.",
    };
  }
  if (isStudyPosition(explicit)) return { action: "setup", fen: explicit };
  if (
    /cut[ -]?off|cutting off/.test(q) &&
    /set|show|load|give|create|position/.test(q)
  )
    return { action: "setup", fen: cutoffFen };
  if (/reset|original position/.test(q))
    return { action: "setup", fen: lesson.fen };
  if (
    /set up|show me|load/.test(q) &&
    /opera|morphy|capablanca|rook ending/.test(q)
  )
    return {
      action: "setup",
      fen: /opera|morphy/.test(q)
        ? courses.attack.lessons[2].fen
        : courses.rook.lessons[1].fen,
    };
  if (/cover|attack|defend|guard/.test(q) && facts.squareControl.length)
    return { action: "answer", answer: facts.squareControl.join(" ") };
  const edit =
    /\b(?:move|put|shift|place)\b.*?\b([a-h][1-8])\s+(?:to|on)\s+([a-h][1-8])\b/.exec(
      q,
    );
  if (edit?.[1] && edit[2])
    return { action: "edit", from: edit[1], to: edit[2] };
  if (/king.*(?:file|step).*closer/.test(q)) {
    const pieces = new Chess(fen).board().flat();
    const white = pieces.find((p) => p?.type === "k" && p.color === "w"),
      black = pieces.find((p) => p?.type === "k" && p.color === "b");
    if (white && black) {
      const file = white.square.charCodeAt(0);
      return {
        action: "edit",
        from: white.square,
        to:
          String.fromCharCode(
            file + Math.sign(black.square.charCodeAt(0) - file),
          ) + white.square.slice(1),
      };
    }
  }
  if (
    /best|line|engine|plan|why|change|evaluate|check/.test(q) &&
    facts.engineLine.length
  )
    return {
      action: "answer",
      answer:
        "Stockfish’s sample line is " +
        facts.engineLine.join(" ") +
        ". Try the first move on the board and compare the reply.",
    };
  if (/whose|turn|legal/.test(q))
    return {
      action: "answer",
      answer:
        facts.side +
        " to move. Legal choices: " +
        (facts.legalMoves.join(", ") || "none") +
        ".",
    };
  return {
    action: "answer",
    answer:
      "Try “set up a cut-off rook ending”, “move a2 to b2”, or paste a FEN. Enable Gemini Nano for open-ended questions.",
  };
}
