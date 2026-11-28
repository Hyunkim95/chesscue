import { Chess, type Move, type Square } from "chess.js";

import { PIECE_NAME, PIECE_VALUE, opponent } from "./board-relations";
import { lineStoryboard, type StoryFrame } from "./line-storyboard";

// A sacrifice whose take-back runs into a mate threat: the better move
// captures or checks, the opponent can take the piece back, and within
// three more moves of the attacker, all checks or captures but the last,
// the attacker threatens mate in one. The threat is checked with chess.js:
// with the defender's turn passed, some move mates. Stockfish only supplies
// the line. Approved 28 November 2026 (KPI case 24, the Greek gift).
export interface SacrificeThreat {
  // "Bxh7+ takes a pawn with check. If Black takes the bishop, Ng5+ and
  // Qh3 threaten mate on h7."
  readonly text: string;
  // The sacrifice, the take-back and the moves up to the threat, in UCI.
  readonly line: readonly string[];
  // Where the threatened mate lands, and the mating move.
  readonly mateFrom: Square;
  readonly mateSquare: Square;
  readonly mateUci: string;
  readonly mateSan: string;
}

const SIDE = { w: "White", b: "Black" } as const;
const ATTACKER_MOVES = 3;

function play(board: Chess, uci: string): Move | undefined {
  try {
    return board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    });
  } catch {
    return undefined;
  }
}

// A move that mates if the side to move in `board` could move again.
function mateThreat(board: Chess): Move | undefined {
  if (board.inCheck() || board.isGameOver()) return undefined;
  const [placement, turn, castling] = board.fen().split(" ");
  if (placement === undefined || turn === undefined) return undefined;
  let passed: Chess;
  try {
    passed = new Chess(
      [
        placement,
        turn === "w" ? "b" : "w",
        castling ?? "-",
        "-",
        "0",
        "1",
      ].join(" "),
    );
  } catch {
    return undefined;
  }
  return passed
    .moves({ verbose: true })
    .find((move) => new Chess(move.after).isCheckmate());
}

const forcing = (move: Move) =>
  move.captured !== undefined || move.san.includes("+");

function joined(parts: readonly string[]): string {
  return parts.length < 2
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
}

// `line` starts with the better move, then the take-back, then the
// attacker's best line after it.
export function sacrificeThreat(
  fen: string,
  line: readonly string[],
): SacrificeThreat | undefined {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return undefined;
  }
  const [bestUci, takeBackUci, ...rest] = line;
  if (bestUci === undefined || takeBackUci === undefined) return undefined;
  const best = play(board, bestUci);
  if (!best || !forcing(best)) return undefined;
  const takeBack = play(board, takeBackUci);
  if (takeBack?.to !== best.to || takeBack.captured === undefined)
    return undefined;

  const attacker: Move[] = [];
  const played = [best.lan, takeBack.lan];
  for (const uci of rest) {
    const move = play(board, uci);
    if (!move || board.isGameOver()) return undefined;
    played.push(move.lan);
    if (move.color !== best.color) continue;
    attacker.push(move);
    const mate = mateThreat(board);
    if (mate) {
      const captured = best.captured;
      const first =
        captured === undefined
          ? `${best.san} gives check.`
          : `${best.san} takes a ${PIECE_NAME[captured]}${best.san.includes("+") ? " with check" : ""}.`;
      const moves = attacker.map(({ san }) => san);
      return {
        text: `${first} If ${SIDE[opponent(best.color)]} takes the ${PIECE_NAME[best.piece]}, ${joined(moves)} ${moves.length > 1 ? "threaten" : "threatens"} mate on ${mate.to}.`,
        line: played,
        mateFrom: mate.from,
        mateSquare: mate.to,
        mateUci: mate.lan,
        mateSan: mate.san,
      };
    }
    if (attacker.length >= ATTACKER_MOVES || !forcing(move)) return undefined;
  }
  return undefined;
}

// The opponent's cheapest way to take back a capture or check on its
// square, when the better move is one.
export function takeBack(fen: string, bestUci: string): string | undefined {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return undefined;
  }
  const best = play(board, bestUci);
  if (!best || !forcing(best)) return undefined;
  return board
    .moves({ verbose: true })
    .filter((move) => move.to === best.to)
    .toSorted((a, b) => PIECE_VALUE[a.piece] - PIECE_VALUE[b.piece])[0]?.lan;
}

// The take-back line on the board: the sacrifice says the point, and the
// threat's frame outlines the mate square with the mating move drawn.
export function sacrificeStoryboard(
  fen: string,
  threat: SacrificeThreat,
): readonly StoryFrame[] {
  const frames = lineStoryboard(fen, threat.line);
  const first = frames[0];
  const last = frames.at(-1);
  if (!first || !last || frames.length !== threat.line.length) return [];
  return frames.map((frame, index) => {
    if (index === 0) return { ...frame, caption: threat.text };
    if (index < frames.length - 1) return frame;
    return {
      ...frame,
      caption: `${moveSan(fen, threat.line)} threatens ${threat.mateSan}.`,
      arrows: [
        ...frame.arrows,
        {
          from: threat.mateFrom,
          to: threat.mateSquare,
          kind: "threat",
        },
      ],
      outlines: [
        ...frame.outlines.filter(({ square }) => square !== threat.mateSquare),
        { square: threat.mateSquare, tone: "coral" },
      ],
    };
  });
}

// The SAN of the last move of `line` from `fen`.
function moveSan(fen: string, line: readonly string[]): string {
  const board = new Chess(fen);
  let san = "";
  for (const uci of line) san = play(board, uci)?.san ?? san;
  return san;
}
