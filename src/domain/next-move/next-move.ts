import { Chess, validateFen, type Color, type Square } from "chess.js";

import { isMateScore } from "../analysis/classify-experiment";
import { lineStoryboard } from "../analysis/line-storyboard";
import { feedbackTier } from "../session/feedback-tier";
import type { FeedbackTier } from "../session/types";
import type { Result } from "../../shared/result/result";
import { err, ok } from "../../shared/result/result";

// The next-move tool (docs/design/chessigma-parity.md, increment 1): any
// position, Stockfish's best moves with their evaluations, and what a played
// move does. Every number comes from Stockfish and every move from chess.js.

export interface EngineCandidate {
  readonly uci: string;
  readonly evaluationCpFromSideToMove: number;
  readonly principalVariation: readonly string[];
  readonly depth: number;
}

export interface PositionAnalysis {
  readonly candidates: readonly EngineCandidate[];
}

// Mates arrive from the engine adapter as ±(100000 − distance).
const MATE_BASE = 100_000;
const MINUS = "−";

export function whiteCp(cpFromSideToMove: number, turn: Color): number {
  return turn === "w" ? cpFromSideToMove : -cpFromSideToMove;
}

export function evalLabel(cpForWhite: number): string {
  const sign = cpForWhite < 0 ? MINUS : "";
  if (isMateScore(cpForWhite))
    return `${sign}#${String(MATE_BASE - Math.abs(cpForWhite))}`;
  const pawns = Math.round(Math.abs(cpForWhite) / 10) / 10;
  if (pawns === 0) return "0.0";
  return `${cpForWhite > 0 ? "+" : MINUS}${pawns.toFixed(1)}`;
}

export interface LineMove {
  readonly uci: string;
  readonly san: string;
  readonly color: Color;
  // The position after this move, so tapping it can play the line to here.
  readonly fen: string;
}

export interface EngineLine {
  readonly rank: number;
  readonly cpForWhite: number;
  readonly label: string;
  readonly moves: readonly LineMove[];
}

// A UCI move in the shape chess.js takes.
export function uciMove(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
  };
}

function play(board: Chess, uci: string) {
  try {
    return board.move(uciMove(uci));
  } catch {
    return null;
  }
}

// Stockfish's lines in SAN, numbered from 1. A line stops at the first move
// chess.js rejects, and a line with no legal first move is left out.
export function engineLines(
  fen: string,
  analysis: PositionAnalysis,
): readonly EngineLine[] {
  const turn = new Chess(fen).turn();
  const lines: EngineLine[] = [];
  for (const candidate of analysis.candidates) {
    const board = new Chess(fen);
    const moves: LineMove[] = [];
    for (const uci of candidate.principalVariation) {
      const move = play(board, uci);
      if (!move) break;
      moves.push({ uci, san: move.san, color: move.color, fen: board.fen() });
    }
    if (moves.length === 0) continue;
    const cpForWhite = whiteCp(candidate.evaluationCpFromSideToMove, turn);
    lines.push({
      rank: lines.length + 1,
      cpForWhite,
      label: evalLabel(cpForWhite),
      moves,
    });
  }
  return lines;
}

const SIDE = { w: "White", b: "Black" } as const;
const FIELD_DEFAULTS = ["w", "-", "-", "0", "1"];

// Castling rights the king and rook on their home squares still allow.
function possibleCastling(board: Chess, rights: string): string {
  const home: Record<string, readonly [Square, Square, Color]> = {
    K: ["e1", "h1", "w"],
    Q: ["e1", "a1", "w"],
    k: ["e8", "h8", "b"],
    q: ["e8", "a8", "b"],
  };
  const kept = rights.split("").filter((right) => {
    const squares = home[right];
    if (!squares) return false;
    const [king, rook, color] = squares;
    const k = board.get(king);
    const r = board.get(rook);
    return (
      k?.type === "k" &&
      k.color === color &&
      r?.type === "r" &&
      r.color === color
    );
  });
  return kept.length === 0 ? "-" : kept.join("");
}

function plainError(error: string): string {
  const kings = /(missing|too many) (white|black) king/.exec(error);
  if (kings) {
    const side = kings[2] === "white" ? "White" : "Black";
    return kings[1] === "missing"
      ? `${side} has no king.`
      : `${side} has two kings.`;
  }
  if (error.includes("pawns are on the edge rows"))
    return "A pawn can't stand on the first or last rank.";
  return "That doesn't look like a FEN.";
}

// A pasted FEN, checked before Stockfish sees it. Missing trailing fields are
// filled, castling rights the pieces no longer allow are dropped, and a
// position Stockfish cannot search is refused with a plain reason.
export function checkFen(text: string): Result<string, string> {
  const fields = text.trim().split(/\s+/);
  if (fields.length < 1 || fields.length > 6 || !fields[0]?.includes("/"))
    return err(plainError(""));
  const filled = [...fields, ...FIELD_DEFAULTS.slice(fields.length - 1)].join(
    " ",
  );
  const checked = validateFen(filled);
  if (!checked.ok) return err(plainError(checked.error ?? ""));
  let board: Chess;
  try {
    board = new Chess(filled);
  } catch {
    return err(plainError(""));
  }
  const parts = filled.split(" ");
  parts[2] = possibleCastling(board, parts[2] ?? "-");
  const fen = parts.join(" ");
  const flipped = fen.split(" ");
  const waiting: Color = board.turn() === "w" ? "b" : "w";
  flipped[1] = waiting;
  flipped[3] = "-";
  let other: Chess;
  try {
    other = new Chess(flipped.join(" "), { skipValidation: true });
  } catch {
    return err(plainError(""));
  }
  if (other.inCheck())
    return err(
      `${SIDE[waiting]} is in check, so it can't be ${SIDE[board.turn()]}'s move.`,
    );
  return ok(fen);
}

export interface MoveVerdict {
  // Rook's one sentence: what the move does and how he answers.
  readonly caption: string;
  // Undefined when the search before the move had not finished.
  readonly tier: FeedbackTier | undefined;
  readonly chip: string;
}

function lowerFirst(text: string): string {
  return text.startsWith("I ")
    ? text
    : text.charAt(0).toLowerCase() + text.slice(1);
}

// What a move played on the board does, from the searches before and after
// it. Rook answers as the other side with Stockfish's best reply.
export function moveVerdict({
  fen,
  playedUci,
  before,
  after,
}: {
  readonly fen: string;
  readonly playedUci: string;
  readonly before: PositionAnalysis | undefined;
  readonly after: PositionAnalysis | undefined;
}): MoveVerdict | undefined {
  const board = new Chess(fen);
  const mover = board.turn();
  const played = play(board, playedUci);
  if (!played) return undefined;

  if (board.isCheckmate())
    return {
      caption: lineStoryboard(fen, [playedUci], mover)[0]?.caption ?? "",
      tier: "best",
      chip: "Checkmate",
    };

  const reply = after?.candidates[0];
  const best = before?.candidates[0];
  const playedCp = board.isGameOver()
    ? 0
    : reply === undefined
      ? undefined
      : -reply.evaluationCpFromSideToMove;
  if (playedCp === undefined) return undefined;

  const tier =
    best === undefined
      ? undefined
      : best.uci === playedUci
        ? "best"
        : feedbackTier({ bestCp: best.evaluationCpFromSideToMove, playedCp });

  const frames = lineStoryboard(
    fen,
    reply === undefined ? [playedUci] : [playedUci, reply.uci],
    mover,
  );
  const said = frames[0]?.caption ?? played.san;
  const answer = frames[1]?.caption;
  const caption =
    answer === undefined
      ? said
      : `${said.replace(/\.$/, "")}, ${tier === undefined || tier === "best" ? "and" : "but"} ${lowerFirst(answer)}`;

  const now = evalLabel(whiteCp(playedCp, mover));
  if (best === undefined || tier === undefined)
    return { caption, tier, chip: `Now ${now}` };
  if (best.uci === playedUci)
    return { caption, tier, chip: `Best move · ${now}` };
  const bestSan = new Chess(fen).move(uciMove(best.uci)).san;
  const was = evalLabel(whiteCp(best.evaluationCpFromSideToMove, mover));
  // Within the review tolerance of the best move, but not Stockfish's first.
  if (tier === "best")
    return {
      caption,
      tier,
      chip: `Good move · ${now} · ${bestSan} was ${was}`,
    };
  return { caption, tier, chip: `${was} → ${now} · ${bestSan} was best` };
}
