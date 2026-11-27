import {
  Chess,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";

import type { BoardArrow } from "./board-move-cues";
import {
  PIECE_NAME,
  PIECE_VALUE,
  attackedBy,
  joinedAnd,
  onMinorHome,
  opponent,
  piecesOf,
} from "./board-relations";
import { CENTRE, byCentrality } from "./centre-control";

// "Show, don't tell": a verified line as board frames. Each frame is one move
// with arrows to what it attacks and a one-line caption, so the explanation
// happens on the board. Every caption names the piece that moved and what it
// newly does, and everything it states is drawn. Rook speaks in the first
// person about his own pieces.

export interface StoryFrame {
  readonly fen: string;
  readonly moveUci: string;
  readonly by: "learner" | "rook";
  readonly arrows: readonly BoardArrow[];
  readonly outlines: readonly {
    readonly square: Square;
    readonly tone: "coral" | "jade";
  }[];
  // Central squares a quiet move starts controlling.
  readonly control: readonly {
    readonly square: Square;
    readonly change: "gained" | "lost";
  }[];
  readonly caption: string;
}

// The learner's moves a storyboard covers, matching the explanation reach.
export const STORY_LEARNER_MOVES = 3;
const MAX_TARGETS = 3;
const MAX_AIMS = 2;
const MAX_CONTROL = 3;

// What a quiet move newly does, read from chess.js only.
interface Deeds {
  // Enemy pieces the moved piece attacks that it did not attack before, the
  // most valuable first.
  readonly aims: readonly Square[];
  // Central squares the moved piece starts controlling, the core four first.
  readonly control: readonly Square[];
  readonly castles: boolean;
  // A knight or bishop leaving its starting square.
  readonly develops: boolean;
  // The mover's attacked pieces the moved piece starts defending.
  readonly defends: readonly {
    readonly square: Square;
    readonly type: PieceSymbol;
  }[];
}

function deedsOf(move: Move): Deeds {
  const before = new Chess(move.before);
  const after = new Chess(move.after);
  const them = opponent(move.color);
  const attackedBefore = new Set(
    attackedBy(before, move.from).map(({ square }) => square),
  );
  const aims = attackedBy(after, move.to)
    .filter(({ type, square }) => type !== "k" && !attackedBefore.has(square))
    .toSorted((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])
    .map(({ square }) => square);
  // Squares the moved piece itself starts covering, so the caption credits
  // the piece that moved and not one it uncovered.
  const covers = (square: Square) =>
    after.attackers(square, move.color).includes(move.to) &&
    !before.attackers(square, move.color).includes(move.from);
  return {
    aims,
    control: byCentrality(
      CENTRE.filter((square) => covers(square) && !aims.includes(square)),
    ),
    castles: move.san.startsWith("O-O"),
    develops: onMinorHome(move.piece, move.color, move.from),
    defends: piecesOf(after, move.color)
      .filter(
        ({ type, square }) =>
          type !== "k" &&
          square !== move.to &&
          after.attackers(square, them).length > 0 &&
          after.attackers(square, move.color).includes(move.to) &&
          !before.attackers(square, move.color).includes(move.from),
      )
      .map(({ square, type }) => ({ square, type })),
  };
}

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

const attack = (from: Square, to: Square): BoardArrow => ({
  from,
  to,
  kind: "attack",
});

function kingSquare(board: Chess, color: Color): Square[] {
  return board.findPiece({ type: "k", color });
}

// A learner move that neither captures nor hits anything: what it starts
// doing, named and drawn.
function quietLearnerFrame(after: Chess, move: Move): StoryFrame {
  const base = {
    fen: after.fen(),
    moveUci: move.lan,
    by: "learner" as const,
  };
  const moved: BoardArrow = { from: move.from, to: move.to, kind: "preview" };
  const deeds = deedsOf(move);
  if (deeds.castles)
    return {
      ...base,
      arrows: [moved],
      outlines: kingSquare(after, move.color).map((square) => ({
        square,
        tone: "jade" as const,
      })),
      control: [],
      caption: `${move.san} gets your king to safety.`,
    };
  // Defending an attacked piece matters most, so it is said first.
  const defends = deeds.defends.slice(0, 1);
  const aims = deeds.aims.slice(0, MAX_AIMS);
  const control = deeds.control
    .filter((square) => !defends.some((piece) => piece.square === square))
    .slice(0, MAX_CONTROL);
  const parts = [
    ...defends.map(
      ({ type, square }) => `defends your ${PIECE_NAME[type]} on ${square}`,
    ),
    ...(aims.length > 0 ? [`aims at ${joinedAnd(aims)}`] : []),
    ...(control.length > 0 ? [`adds control of ${joinedAnd(control)}`] : []),
  ];
  const name = PIECE_NAME[move.piece];
  return {
    ...base,
    arrows: [
      moved,
      ...aims.map((square) => attack(move.to, square)),
      ...defends.map(({ square }) => ({
        from: move.to,
        to: square,
        kind: "control" as const,
      })),
    ],
    outlines: defends.map(({ square }) => ({
      square,
      tone: "jade" as const,
    })),
    control: control.map((square) => ({ square, change: "gained" as const })),
    caption:
      parts.length > 0
        ? `${move.san} ${joinedAnd(parts)}.`
        : deeds.develops
          ? `${move.san} brings your ${name} into play.`
          : `${move.san} moves your ${name} to ${move.to}.`,
  };
}

function learnerFrame(after: Chess, move: Move): StoryFrame {
  const them = opponent(move.color);
  if (after.isCheckmate()) {
    const kings = kingSquare(after, them);
    return {
      fen: after.fen(),
      moveUci: move.lan,
      by: "learner",
      arrows: [
        { from: move.from, to: move.to, kind: "preview" },
        ...kings
          .filter((king) => after.attackers(king, move.color).includes(move.to))
          .map((king) => attack(move.to, king)),
      ],
      outlines: kings.map((square) => ({ square, tone: "coral" as const })),
      control: [],
      caption: `${move.san} is checkmate.`,
    };
  }
  const targets = attackedBy(after, move.to)
    .filter(
      ({ type, square }) =>
        type === "k" ||
        after.attackers(square, them).length === 0 ||
        PIECE_VALUE[type] > PIECE_VALUE[move.piece],
    )
    .toSorted((a, b) => (a.type === "k" ? -1 : b.type === "k" ? 1 : 0))
    .slice(0, MAX_TARGETS);
  const pieces = targets.filter(({ type }) => type !== "k");
  const named = ({ type, square }: (typeof pieces)[number]) =>
    `${PIECE_NAME[type]} on ${square}`;
  const loose = pieces.filter(
    ({ square }) => after.attackers(square, them).length === 0,
  );
  const unguarded =
    loose.length === 0
      ? ""
      : pieces.length === 1
        ? ", which nothing defends"
        : loose.length === pieces.length
          ? `, and ${pieces.length === 2 ? "neither" : "none"} is defended`
          : `, and nothing defends the ${joinedAnd(loose.map(named))}`;
  const parts = [
    ...(move.captured ? [`takes my ${PIECE_NAME[move.captured]}`] : []),
    ...(targets.some(({ type }) => type === "k") ? ["checks my king"] : []),
    ...(pieces.length > 0
      ? [
          `attacks ${joinedAnd(pieces.map((piece) => `my ${named(piece)}`))}${unguarded}`,
        ]
      : []),
  ];
  if (parts.length === 0) return quietLearnerFrame(after, move);
  return {
    fen: after.fen(),
    moveUci: move.lan,
    by: "learner",
    arrows: [
      { from: move.from, to: move.to, kind: "preview" },
      ...targets.map(({ square }) => attack(move.to, square)),
    ],
    outlines: targets.map(({ square }) => ({ square, tone: "coral" as const })),
    control: [],
    caption: `${move.san} ${joinedAnd(parts)}.`,
  };
}

function rookFrame(after: Chess, move: Move, forced: boolean): StoryFrame {
  const base = {
    fen: after.fen(),
    moveUci: move.lan,
    by: "rook" as const,
    control: [],
  };
  const moved: BoardArrow = { from: move.from, to: move.to, kind: "reply" };
  if (forced)
    return {
      ...base,
      arrows: [moved],
      outlines: [],
      caption: `I have to play ${move.san}.`,
    };
  if (move.captured)
    return {
      ...base,
      arrows: [moved],
      outlines: [],
      caption: `I take your ${PIECE_NAME[move.captured]} with ${move.san}.`,
    };
  if (after.inCheck()) {
    // A discovered check comes from a piece that did not move.
    const kings = kingSquare(after, opponent(move.color));
    return {
      ...base,
      arrows: [
        moved,
        ...kings.flatMap((king) =>
          after
            .attackers(king, move.color)
            .map((checker) => attack(checker, king)),
        ),
      ],
      outlines: kings.map((square) => ({ square, tone: "coral" as const })),
      caption: `I answer ${move.san} and check your king.`,
    };
  }
  const deeds = deedsOf(move);
  if (deeds.castles)
    return {
      ...base,
      arrows: [moved],
      outlines: kingSquare(after, move.color).map((square) => ({
        square,
        tone: "coral" as const,
      })),
      caption: `I answer ${move.san} and tuck my king away.`,
    };
  const aims = deeds.aims.slice(0, MAX_AIMS);
  if (aims.length > 0)
    return {
      ...base,
      arrows: [moved, ...aims.map((square) => attack(move.to, square))],
      outlines: aims.map((square) => ({ square, tone: "coral" as const })),
      caption: `I answer ${move.san}, aiming at ${joinedAnd(aims)}.`,
    };
  const control = deeds.control.slice(0, MAX_CONTROL);
  if (control.length > 0)
    return {
      ...base,
      arrows: [moved],
      outlines: control.map((square) => ({ square, tone: "coral" as const })),
      caption: `I answer ${move.san}, covering ${joinedAnd(control)}.`,
    };
  return {
    ...base,
    arrows: [moved],
    outlines: [],
    caption: deeds.develops
      ? `I answer ${move.san}, bringing my ${PIECE_NAME[move.piece]} into play.`
      : `I answer ${move.san}.`,
  };
}

// The learner moves first unless `learner` says otherwise, as in "What if
// you'd played …?", where the line starts with Rook's move.
export function lineStoryboard(
  fen: string,
  line: readonly string[],
  learner?: Color,
): readonly StoryFrame[] {
  const frames: StoryFrame[] = [];
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return [];
  }
  const learnerColor = learner ?? board.turn();
  const plies =
    STORY_LEARNER_MOVES * 2 - (board.turn() === learnerColor ? 1 : 0);
  for (const uci of line.slice(0, plies)) {
    if (board.isGameOver()) break;
    const forced = board.moves().length === 1;
    const move = play(board, uci);
    if (!move) break;
    frames.push(
      move.color === learnerColor
        ? learnerFrame(board, move)
        : rookFrame(board, move, forced),
    );
  }
  return frames;
}

// After the learner solves a position with a good move of their own, Rook's
// best move from the start, with the one thing it adds over theirs:
// "Nf3 works too. It also covers e5." Undefined when they played it.
export function alternativeFrame(
  fen: string,
  playedUci: string,
  bestUci: string,
): StoryFrame | undefined {
  if (playedUci === bestUci) return undefined;
  let start: Chess;
  try {
    start = new Chess(fen);
  } catch {
    return undefined;
  }
  const best = play(new Chess(start.fen()), bestUci);
  const played = play(new Chess(start.fen()), playedUci);
  if (!best || !played || best.lan === played.lan) return undefined;
  const mine = deedsOf(best);
  const theirs = deedsOf(played);
  const after = new Chess(best.after);
  const aims = mine.aims
    .filter((square) => !theirs.aims.includes(square))
    .slice(0, MAX_AIMS);
  const control = mine.control
    .filter((square) => !theirs.control.includes(square))
    .slice(0, MAX_CONTROL);
  const castles = mine.castles && !theirs.castles;
  const develops = !castles && mine.develops && !theirs.develops;
  const extra =
    aims.length > 0
      ? `It also aims at ${joinedAnd(aims)}.`
      : control.length > 0
        ? `It also covers ${joinedAnd(control)}.`
        : castles
          ? "It also gets your king to safety."
          : develops
            ? `It also brings your ${PIECE_NAME[best.piece]} into play.`
            : undefined;
  const shownControl = aims.length === 0 ? control : [];
  return {
    fen: best.after,
    moveUci: best.lan,
    by: "learner",
    arrows: [
      { from: best.from, to: best.to, kind: "preview" },
      ...aims.map((square) => attack(best.to, square)),
    ],
    outlines:
      castles && aims.length === 0 && control.length === 0
        ? kingSquare(after, best.color).map((square) => ({
            square,
            tone: "jade" as const,
          }))
        : [],
    control: shownControl.map((square) => ({
      square,
      change: "gained" as const,
    })),
    caption: `${best.san} works too.${extra ? ` ${extra}` : ""}`,
  };
}

const COUNT_WORDS = [
  "",
  "a",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
];

// "a bishop", "two pawns", "a rook and a pawn": most valuable first.
function pieceList(pieces: readonly PieceSymbol[]): string {
  const counts = new Map<PieceSymbol, number>();
  for (const piece of pieces) counts.set(piece, (counts.get(piece) ?? 0) + 1);
  return joinedAnd(
    [...counts]
      .toSorted(([a], [b]) => PIECE_VALUE[b] - PIECE_VALUE[a])
      .map(([piece, count]) => {
        const word = COUNT_WORDS[count] ?? String(count);
        return count === 1
          ? `${word} ${PIECE_NAME[piece]}`
          : `${word} ${PIECE_NAME[piece]}s`;
      }),
  );
}

// The last frame of a winning line: what the learner comes out with, with the
// squares where they took material outlined. None when the line mates (its
// last caption already says so) or wins nothing.
export function payoffFrame(
  fen: string,
  frames: readonly StoryFrame[],
): StoryFrame | undefined {
  const last = frames.at(-1);
  if (!last) return undefined;
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return undefined;
  }
  const won: PieceSymbol[] = [];
  const lost: PieceSymbol[] = [];
  const squares: Square[] = [];
  for (const frame of frames) {
    const move = play(board, frame.moveUci);
    if (!move) return undefined;
    if (!move.captured) continue;
    if (frame.by === "learner") {
      won.push(move.captured);
      squares.push(move.to);
    } else lost.push(move.captured);
  }
  if (board.isCheckmate() || won.length === 0) return undefined;
  const value = (pieces: readonly PieceSymbol[]) =>
    pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0);
  if (value(won) <= value(lost)) return undefined;
  // Not a move: no last-move highlight, so the outlines read clearly.
  return {
    fen: last.fen,
    moveUci: "",
    by: last.by,
    arrows: [],
    outlines: [...new Set(squares)].map((square) => ({
      square,
      tone: "jade",
    })),
    control: [],
    caption:
      lost.length === 0
        ? `You've won ${pieceList(won)}.`
        : `You've won ${pieceList(won)} for ${pieceList(lost)}.`,
  };
}
