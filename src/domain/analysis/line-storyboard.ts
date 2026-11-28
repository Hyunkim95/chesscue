import {
  Chess,
  SQUARES,
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
  lineHits,
  linesFor,
  onMinorHome,
  opponent,
  piecesOf,
  staticExchange,
} from "./board-relations";
import { CENTRE, byCentrality } from "./centre-control";
import { dangerFacts } from "./danger-facts";

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
  // The piece a point storyboard is heading for, where it stands in this
  // frame: the piece the point wins, or the king it mates.
  readonly goal?: StoryGoal;
}

export interface StoryGoal {
  readonly square: Square;
  readonly piece: string;
  // Rook's goal: the learner's piece he wins, or the king he mates.
  readonly rook?: true;
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
  // A quiet move that threatens mate in one says so first, with the mating
  // move drawn: "Ng5 threatens mate with Qf7#."
  const mate = (dangerFacts(after.fen()) ?? []).find(
    ({ kind }) => kind === "mate-threat",
  );
  const mating = mate ? /with (\S+)\.$/.exec(mate.text)?.[1] : undefined;
  const route = mate?.id.slice("mate-threat:".length);
  const from = SQUARES.find((square) => square === route?.slice(0, 2));
  const to = SQUARES.find((square) => square === route?.slice(2, 4));
  if (mate && mating && from && to)
    return {
      ...base,
      arrows: [moved, attack(from, to)],
      outlines: [{ square: mate.target, tone: "coral" as const }],
      control: [],
      caption: `${move.san} threatens mate with ${mating}.`,
    };
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
    outlines: [
      ...defends.map(({ square }) => ({
        square,
        tone: "jade" as const,
      })),
      // "brings your knight into play": the piece, where it now stands.
      ...(parts.length === 0 && deeds.develops
        ? [{ square: move.to, tone: "jade" as const }]
        : []),
    ],
    control: control.map((square) => ({ square, change: "gained" as const })),
    caption:
      parts.length > 0
        ? `${move.san} ${joinedAnd(parts)}.`
        : deeds.develops
          ? `${move.san} brings your ${name} into play.`
          : `${move.san} moves your ${name} to ${move.to}.`,
  };
}

function pinFrame(
  after: Chess,
  move: Move,
  by: StoryFrame["by"],
): StoryFrame | undefined {
  if (after.isCheckmate()) return undefined;
  const enemy = opponent(move.color);
  const piece = after.get(move.to);
  if (!piece) return undefined;
  for (const ray of linesFor(piece.type)) {
    const [target, king] = lineHits(after, move.to, ray);
    if (!target || !king) continue;
    const pinned = after.get(target);
    const behind = after.get(king);
    if (
      pinned?.color !== enemy ||
      behind?.color !== enemy ||
      behind.type !== "k"
    )
      continue;
    const side = by === "rook" ? "your" : "my";
    return {
      fen: after.fen(),
      moveUci: move.lan,
      by,
      arrows: [
        {
          from: move.from,
          to: move.to,
          kind: by === "rook" ? "reply" : "preview",
        },
        attack(move.to, king),
      ],
      outlines: [
        { square: target, tone: "coral" },
        { square: king, tone: "coral" },
      ],
      control: [],
      caption:
        by === "rook"
          ? `I play ${move.san}, pinning ${side} ${PIECE_NAME[pinned.type]} on ${target} to ${side} king.`
          : `${move.san} pins ${side} ${PIECE_NAME[pinned.type]} on ${target} to ${side} king.`,
    };
  }
  return undefined;
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
  const pin = pinFrame(after, move, "learner");
  if (pin) return pin;
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
    // What the move took is outlined where it stood, beside what it hits.
    outlines: [
      ...(move.captured ? [{ square: move.to, tone: "jade" as const }] : []),
      ...targets.map(({ square }) => ({ square, tone: "coral" as const })),
    ],
    control: [],
    caption: `${move.san} ${joinedAnd(parts)}.`,
  };
}

// What Rook's move wins time against: two or more of the learner's pieces
// hit at once by the moved piece, or else a line it uncovers for another of
// Rook's pieces onto something worth taking. One per caption.
type Threat =
  | {
      readonly kind: "fork";
      readonly targets: readonly { square: Square; type: PieceSymbol }[];
    }
  | {
      readonly kind: "uncovered";
      readonly from: Square;
      readonly piece: PieceSymbol;
      readonly square: Square;
      readonly type: PieceSymbol;
    };

function threatOf(before: Chess, after: Chess, move: Move): Threat | undefined {
  const learner = opponent(move.color);
  const worth = (square: Square, type: PieceSymbol, by: PieceSymbol) =>
    type === "k" ||
    (type !== "p" &&
      (after.attackers(square, learner).length === 0 ||
        PIECE_VALUE[type] > PIECE_VALUE[by]));
  const targets = attackedBy(after, move.to)
    .filter(({ square, type }) => worth(square, type, move.piece))
    .toSorted((a, b) => (a.type === "k" ? -1 : b.type === "k" ? 1 : 0))
    .slice(0, MAX_TARGETS)
    .map(({ square, type }) => ({ square, type }));
  if (targets.length >= 2) return { kind: "fork", targets };
  for (const { square: from, type: piece } of piecesOf(after, move.color)) {
    if (from === move.to || !linesFor(piece).length) continue;
    if (before.get(from)?.type !== piece) continue;
    const earlier = new Set(
      attackedBy(before, from).map(({ square }) => square),
    );
    const target = attackedBy(after, from)
      .filter(
        ({ square, type }) =>
          !earlier.has(square) && worth(square, type, piece),
      )
      .toSorted((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])[0];
    if (target)
      return {
        kind: "uncovered",
        from,
        piece,
        square: target.square,
        type: target.type,
      };
  }
  return undefined;
}

// The square of the piece a capture removes, which differs from the
// destination only en passant.
function capturedSquare(move: Move): Square {
  if (!move.isEnPassant()) return move.to;
  const square = SQUARES.find(
    (candidate) => candidate === `${move.to[0] ?? ""}${move.from[1] ?? ""}`,
  );
  return square ?? move.to;
}

function threatFrame(
  after: Chess,
  move: Move,
  threat: Threat,
  moved: BoardArrow,
): StoryFrame {
  const your = ({ square, type }: { square: Square; type: PieceSymbol }) =>
    `your ${PIECE_NAME[type]} on ${square}`;
  const fork = threat.kind === "fork";
  const targets = fork ? threat.targets : [threat];
  const object = fork
    ? `${joinedAnd(threat.targets.map(your))} at once`
    : `my ${PIECE_NAME[threat.piece]} on ${threat.from} onto ${your(threat)}`;
  const [verb, participle] = fork
    ? ["attack", "attacking"]
    : ["open", "opening"];
  const caption = move.captured
    ? `I take your ${PIECE_NAME[move.captured]} with ${move.san} and ${verb} ${object}.`
    : `I answer ${move.san}, ${participle} ${object}.`;
  return {
    fen: after.fen(),
    moveUci: move.lan,
    by: "rook",
    control: [],
    arrows: [
      moved,
      ...targets.map(({ square }) =>
        attack(fork ? move.to : threat.from, square),
      ),
    ],
    outlines: [
      ...(move.captured
        ? [{ square: capturedSquare(move), tone: "coral" as const }]
        : []),
      ...targets.map(({ square }) => ({ square, tone: "coral" as const })),
    ],
    caption,
  };
}

function rookFrame(
  before: Chess,
  after: Chess,
  move: Move,
  forced: boolean,
): StoryFrame {
  const base = {
    fen: after.fen(),
    moveUci: move.lan,
    by: "rook" as const,
    control: [],
  };
  const moved: BoardArrow = { from: move.from, to: move.to, kind: "reply" };
  const pin = pinFrame(after, move, "rook");
  if (pin) return pin;
  const threat = move.san.startsWith("O-O")
    ? undefined
    : threatOf(before, after, move);
  if (threat) return threatFrame(after, move, threat, moved);
  if (forced) {
    // Usually forced by a check: the checking pieces are drawn on the king.
    const [king] = before.inCheck() ? kingSquare(before, move.color) : [];
    return {
      ...base,
      arrows: [
        moved,
        ...(king
          ? before
              .attackers(king, opponent(move.color))
              .map((checker) => attack(checker, king))
          : []),
      ],
      outlines: [{ square: king ?? move.to, tone: "coral" }],
      caption: `I have to play ${move.san}.`,
    };
  }
  if (move.captured)
    return {
      ...base,
      arrows: [moved],
      outlines: [{ square: capturedSquare(move), tone: "coral" }],
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
      arrows: [
        moved,
        ...control.map(
          (square): BoardArrow => ({
            from: move.to,
            to: square,
            kind: "control",
          }),
        ),
      ],
      outlines: control.map((square) => ({ square, tone: "coral" as const })),
      caption: `I answer ${move.san}, covering ${joinedAnd(control)}.`,
    };
  return {
    ...base,
    arrows: [moved],
    // A developing move marks the square the piece comes into play on.
    outlines: deeds.develops ? [{ square: move.to, tone: "jade" }] : [],
    caption: deeds.develops
      ? `I answer ${move.san}, bringing my ${PIECE_NAME[move.piece]} into play.`
      : `I answer ${move.san}.`,
  };
}

// Only named tactics established by replaying the move on the verified board.
export function tacticFrame(
  fen: string,
  uci: string,
  learner: Color,
): { readonly kind: "pin" | "fork"; readonly frame: StoryFrame } | undefined {
  try {
    const before = new Chess(fen);
    const after = new Chess(fen);
    const move = play(after, uci);
    if (!move || after.isCheckmate()) return undefined;
    const by = move.color === learner ? "learner" : "rook";
    const pin = pinFrame(after, move, by);
    if (pin) return { kind: "pin", frame: pin };
    const threat = threatOf(before, after, move);
    if (threat?.kind !== "fork") return undefined;
    return {
      kind: "fork",
      frame:
        by === "learner"
          ? learnerFrame(after, move)
          : threatFrame(after, move, threat, {
              from: move.from,
              to: move.to,
              kind: "reply",
            }),
    };
  } catch {
    return undefined;
  }
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
  // Never stop while the side to move can win material at once: a line cut
  // off mid-exchange would claim a result the next move undoes.
  for (const [index, uci] of line.entries()) {
    if (board.isGameOver()) break;
    if (index >= plies && (index >= plies + MAX_SETTLE || !pendingWin(board)))
      break;
    const forced = board.moves().length === 1;
    const before = new Chess(board.fen());
    const move = play(board, uci);
    if (!move) break;
    frames.push(
      move.color === learnerColor
        ? learnerFrame(board, move)
        : rookFrame(before, board, move, forced),
    );
  }
  return frames;
}

// How many half-moves past its length a line may run to settle an exchange.
const MAX_SETTLE = 4;

// Whether the side to move can win material straight away by a capture.
export function pendingWin(board: Chess): boolean {
  return pendingCapture(board) !== undefined;
}

// The most valuable piece the side to move can win straight away, if any.
function pendingCapture(board: Chess): PieceSymbol | undefined {
  const side = board.turn();
  return piecesOf(board, opponent(side))
    .filter(
      ({ type, square }) =>
        type !== "k" && staticExchange(board, square, side) > 0,
    )
    .toSorted((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])[0]?.type;
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
  // Name the net gain: a queen for a queen cancels out.
  for (const piece of [...lost]) {
    const at = won.indexOf(piece);
    if (at === -1) continue;
    won.splice(at, 1);
    lost.splice(lost.indexOf(piece), 1);
  }
  if (won.length === 0) return undefined;
  // A result only counts once the exchange is over: a piece the side to move
  // can still win at once is counted as taken.
  const pending = pendingCapture(board);
  if (pending) {
    const learnerToMove = frames.at(-1)?.by === "rook";
    if (learnerToMove) return undefined;
    lost.push(pending);
  }
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

interface Capture {
  readonly by: Color;
  readonly piece: PieceSymbol;
  // Where the capture happened, and where the taken piece started the line.
  readonly at: Square;
  readonly origin: Square;
}

interface Replay {
  readonly board: Chess;
  readonly captures: readonly Capture[];
  // Each piece's square now, mapped to the square it started the line on.
  readonly origins: ReadonlyMap<Square, Square>;
}

const asSquare = (name: string): Square | undefined =>
  SQUARES.find((square) => square === name);

// The rook's squares when the king castles to the given square.
const CASTLE_ROOK: Readonly<
  Partial<Record<Square, readonly [Square, Square]>>
> = {
  g1: ["h1", "f1"],
  c1: ["a1", "d1"],
  g8: ["h8", "f8"],
  c8: ["a8", "d8"],
};

// Plays a line and follows every piece back to where it started, so a piece
// won in one line can be found in another.
function replay(fen: string, line: readonly string[]): Replay | undefined {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return undefined;
  }
  const origins = new Map<Square, Square>();
  for (const row of board.board())
    for (const piece of row) if (piece) origins.set(piece.square, piece.square);
  const captures: Capture[] = [];
  for (const uci of line) {
    const move = play(board, uci);
    if (!move) return undefined;
    const origin = origins.get(move.from) ?? move.from;
    origins.delete(move.from);
    const taken = move.isEnPassant()
      ? asSquare(`${move.to.slice(0, 1)}${move.from.slice(1)}`)
      : move.to;
    if (move.captured && taken) {
      captures.push({
        by: move.color,
        piece: move.captured,
        at: taken,
        origin: origins.get(taken) ?? taken,
      });
      origins.delete(taken);
    }
    origins.set(move.to, origin);
    const rook =
      move.isKingsideCastle() || move.isQueensideCastle()
        ? CASTLE_ROOK[move.to]
        : undefined;
    if (rook) {
      const [from, to] = rook;
      origins.set(to, origins.get(from) ?? from);
      origins.delete(from);
    }
  }
  return { board, captures, origins };
}

const worth = (pieces: readonly PieceSymbol[]) =>
  pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0);

function wonBy(replayed: Replay, color: Color): PieceSymbol[] {
  return replayed.captures
    .filter(({ by }) => by === color)
    .map(({ piece }) => piece);
}

function captureSquares(
  replayed: Replay,
  color: Color,
  where: "at" | "origin",
): Square[] {
  return [
    ...new Set(
      replayed.captures
        .filter(({ by }) => by === color)
        .map((capture) => capture[where]),
    ),
  ];
}

// "your knight" or "the rook" for one piece, "a rook and a pawn" for more.
function oneOrList(pieces: readonly PieceSymbol[], article: string): string {
  const [only] = pieces;
  return pieces.length === 1 && only
    ? `${article} ${PIECE_NAME[only]}`
    : pieceList(pieces);
}

function mated(board: Chess, color: Color): boolean {
  return board.isCheckmate() && board.turn() === color;
}

// The last frame of a refutation, from Rook's side: what the tried move costs
// the learner, drawn on the board. "That lets me mate.", "I win your knight."
// or, against the line the learner could have played, "You missed a chance
// to win my rook. Try again." None when the line shows no such cost.
export function costFrame(
  fen: string,
  frames: readonly StoryFrame[],
  learner: Color,
  // The line move and what follows it from the same position.
  instead?: readonly string[],
  // How the game stands for Rook after the try. Only a level position is
  // called safe.
  standing?: Standing,
): StoryFrame | undefined {
  const last = frames.at(-1);
  const tried = replay(
    fen,
    frames.map(({ moveUci }) => moveUci),
  );
  if (!last || !tried) return undefined;
  const rook = opponent(learner);
  const base = {
    fen: last.fen,
    moveUci: "",
    by: "rook" as const,
    control: [],
  };
  const { board } = tried;
  if (mated(board, learner)) {
    const kings = kingSquare(board, learner);
    return {
      ...base,
      arrows: kings.flatMap((king) =>
        board.attackers(king, rook).map((checker) => attack(checker, king)),
      ),
      outlines: kings.map((square) => ({ square, tone: "coral" as const })),
      caption: "That lets me mate.",
    };
  }
  const mine = wonBy(tried, rook);
  const yours = wonBy(tried, learner);
  // Material only counts once the exchange is over.
  if (worth(mine) > worth(yours) && !pendingWin(board))
    return {
      ...base,
      arrows: [],
      outlines: captureSquares(tried, rook, "at").map((square) => ({
        square,
        tone: "coral" as const,
      })),
      caption:
        yours.length === 0
          ? `I win ${oneOrList(mine, "your")}.`
          : `I win ${oneOrList(mine, "your")} for ${pieceList(yours)}.`,
    };
  const line = instead ? replay(fen, instead) : undefined;
  if (!line) return undefined;
  if (mated(line.board, rook))
    return {
      ...base,
      arrows: [],
      outlines: kingSquare(board, rook).map((square) => ({
        square,
        tone: "coral" as const,
      })),
      caption: "My king gets away.",
    };
  const missed = line.captures
    .filter(({ by }) => by === learner)
    .toSorted((a, b) => PIECE_VALUE[b.piece] - PIECE_VALUE[a.piece]);
  const [prize] = missed;
  const gain =
    worth(missed.map(({ piece }) => piece)) - worth(wonBy(line, rook));
  if (!prize || gain <= 0 || worth(yours) - worth(mine) >= gain)
    return undefined;
  const kept = [...tried.origins].find(
    ([, origin]) => origin === prize.origin,
  )?.[0];
  if (kept === undefined) return undefined;
  return {
    ...base,
    arrows: [],
    outlines: [{ square: kept, tone: "coral" }],
    // Owner wording (28 November 2026): say what the try missed, never the
    // move that wins it.
    caption: `${standing === "level" ? "That's safe, but you" : "You"} missed a chance to win my ${PIECE_NAME[prize.piece]}. Try again.`,
  };
}

// Why the line move works, shown on the position right after it: what it
// sets up (a fork, an uncovered attack, a check or a threat) and the capture
// it leads to, or a piece it takes that has no defender. `shown` is the
// checked line: the line move, Rook's reply, then the learner's capture.
// Undefined unless code confirms the mechanism on the board.
function missedMechanismFrame(
  move: Move,
  tried: StoryFrame,
  shown: readonly StoryFrame[],
  // What the whole line nets the learner: the named capture must carry it.
  net: number,
): StoryFrame | undefined {
  const board = new Chess(move.after);
  const rook = opponent(move.color);
  const frame = (
    arrows: readonly BoardArrow[],
    targets: readonly Square[],
    caption: string,
  ): StoryFrame => ({
    fen: move.after,
    moveUci: "",
    by: "learner",
    arrows,
    outlines: targets.map((square) => ({ square, tone: "coral" })),
    control: [],
    caption,
  });

  // A piece taken for free needs no follow-up.
  if (
    move.captured &&
    PIECE_VALUE[move.captured] >= net &&
    board.attackers(move.to, rook).length === 0
  )
    return frame(
      [{ from: move.from, to: move.to, kind: "preview" }],
      [move.to],
      `${move.san} takes my ${PIECE_NAME[move.captured]}, which has no defender.`,
    );

  const [, replyFrame, captureFrame] = shown;
  if (!replyFrame || !captureFrame) return undefined;
  const threat = threatOf(new Chess(move.before), board, move);
  const scratch = new Chess(move.after);
  const reply = play(scratch, replyFrame.moveUci);
  if (!reply) return undefined;
  const capture = play(scratch, captureFrame.moveUci);
  if (!capture?.captured || PIECE_VALUE[capture.captured] < net)
    return undefined;
  const prize = capture.captured;
  // Rook may take something back, but less than the prize.
  const back = pendingCapture(scratch);
  if (back && PIECE_VALUE[back] >= PIECE_VALUE[prize]) return undefined;
  const prizeName = PIECE_NAME[prize];
  // The prize is still there after the tried move and the try does not win
  // it too, so the try really missed it.
  const other = new Chess(tried.fen);
  const kept = other.get(capture.to);
  if (kept?.type !== prize || kept.color !== rook) return undefined;
  if (staticExchange(other, capture.to, move.color) >= 2) return undefined;
  const replied = { from: reply.from, to: reply.to, kind: "reply" } as const;
  const then = `so after ${reply.san} you take the ${prizeName} with ${capture.san}.`;

  if (threat?.kind === "fork" && capture.from === move.to) {
    const tempo = threat.targets.find(({ square }) => square === reply.from);
    const target = threat.targets.find(({ square }) => square === capture.to);
    const both = tempo && target && tempo.square !== target.square;
    const alreadyForked =
      both &&
      other
        .attackers(tempo.square, move.color)
        .some((from) =>
          other.attackers(target.square, move.color).includes(from),
        );
    if (both && !alreadyForked) {
      const squares = [tempo.square, target.square];
      return frame(
        [...squares.map((square) => attack(move.to, square)), replied],
        squares,
        `${move.san} forks my ${PIECE_NAME[tempo.type]} and ${prizeName}, ${then}`,
      );
    }
  }

  if (
    threat?.kind === "uncovered" &&
    capture.from === threat.from &&
    capture.to === threat.square
  )
    return frame(
      [attack(threat.from, threat.square), replied],
      [threat.square],
      `${move.san} uncovers your ${PIECE_NAME[threat.piece]}'s attack on my ${prizeName}, so after ${reply.san} you take it with ${capture.san}.`,
    );

  // The capture was already on once the line move was played.
  const lined = board.attackers(capture.to, move.color).includes(capture.from);
  if (!lined) return undefined;
  if (board.inCheck()) {
    const kings = kingSquare(board, rook);
    return frame(
      [
        ...kings.flatMap((king) =>
          board.attackers(king, move.color).map((from) => attack(from, king)),
        ),
        attack(capture.from, capture.to),
        replied,
      ],
      [...kings, capture.to],
      `${move.san} gives check, ${then}`,
    );
  }
  // A threat names the capture only when it is the threat itself, or a mate
  // threat that the reply has to meet.
  const facts = board.turn() === rook ? (dangerFacts(board.fen()) ?? []) : [];
  const mateWith = /with (\S+)\.$/.exec(
    facts.find(({ kind }) => kind === "mate-threat")?.text ?? "",
  )?.[1];
  const wins = facts.find(
    ({ kind, target }) => kind === "wins-material" && target === capture.to,
  );
  const threatens = mateWith
    ? `threatens mate with ${mateWith}`
    : wins
      ? `threatens to win my ${PIECE_NAME[wins.piece]} on ${wins.target}`
      : undefined;
  if (threatens)
    return frame(
      [attack(capture.from, capture.to), replied],
      [capture.to],
      `${move.san} ${threatens}, ${then}`,
    );
  return undefined;
}

// Close a refutation by showing a verified missed mechanism or its payoff.
export function insteadFrame(
  fen: string,
  line: readonly string[],
  learner: Color,
  tried?: StoryFrame,
): StoryFrame | undefined {
  const [lineUci] = line;
  let start: Chess;
  try {
    start = new Chess(fen);
  } catch {
    return undefined;
  }
  const move = lineUci === undefined ? undefined : play(start, lineUci);
  const shown = lineStoryboard(fen, line, learner);
  const replayed = replay(
    fen,
    shown.map(({ moveUci }) => moveUci),
  );
  if (!move || !replayed) return undefined;
  const rook = opponent(learner);
  const base = {
    fen,
    moveUci: "",
    by: "learner" as const,
    arrows: [{ from: move.from, to: move.to, kind: "preview" as const }],
    control: [],
  };
  if (mated(replayed.board, rook))
    return {
      ...base,
      outlines: kingSquare(new Chess(fen), rook).map((square) => ({
        square,
        tone: "coral" as const,
      })),
      caption:
        shown.length === 1
          ? `${move.san} instead is checkmate.`
          : `${move.san} instead leads to mate.`,
    };
  const won = wonBy(replayed, learner);
  const lost = wonBy(replayed, rook);
  if (worth(won) > worth(lost)) {
    const mechanism = tried
      ? missedMechanismFrame(move, tried, shown, worth(won) - worth(lost))
      : undefined;
    if (mechanism) return mechanism;
    return {
      ...base,
      outlines: captureSquares(replayed, learner, "origin").map((square) => ({
        square,
        tone: "jade" as const,
      })),
      caption:
        lost.length === 0
          ? `${move.san} instead wins ${oneOrList(won, "the")}.`
          : `${move.san} instead wins ${oneOrList(won, "the")} for ${pieceList(lost)}.`,
    };
  }
  return {
    ...base,
    outlines: [],
    caption: `Stockfish prefers ${move.san} here.`,
  };
}

// How the position stands after a try whose cost the line does not show in
// material, from Stockfish's evaluation.
export type Standing = "level" | "better" | "winning";

const STANDING: Readonly<Record<Standing, (san: string) => string>> = {
  level: (san) => `After ${san} the position stays level.`,
  better: (san) => `After ${san} I'm a little better.`,
  winning: (san) => `After ${san} I'm winning.`,
};

// "Why not {move}?": the tried move, Rook's best answer and what follows,
// ending with what it costs. Once the answer is known, one more frame shows
// the line move instead.
export function refutationStoryboard({
  fen,
  line,
  learner,
  standing,
  instead,
  answerKnown,
}: {
  readonly fen: string;
  // The tried move and Stockfish's line after it.
  readonly line: readonly string[];
  readonly learner: Color;
  readonly standing: Standing;
  // The line move and what follows it from the same position.
  readonly instead: readonly string[];
  // Before the position is solved, the line move is never shown or named.
  readonly answerKnown: boolean;
}): readonly StoryFrame[] {
  const all = lineStoryboard(fen, line, learner);
  const [first] = all;
  if (!first) return [];
  const closing = answerKnown
    ? insteadFrame(fen, instead, learner, first)
    : undefined;
  const ending = (frames: readonly StoryFrame[], cost: StoryFrame) => [
    ...frames,
    cost,
    ...(closing ? [closing] : []),
  ];

  // What the try costs: the line stops where Rook's point lands, and the
  // piece he wins (or the king he mates) is his goal on every step.
  const landing = pointLanding(fen, all, opponent(learner));
  if (landing) {
    const cut = all.slice(0, landing.end + 1);
    const tried = replay(
      fen,
      cut.map(({ moveUci }) => moveUci),
    );
    const cost = costFrame(fen, cut, learner, instead, standing);
    const rookWins =
      tried !== undefined &&
      (mated(tried.board, learner) ||
        (worth(wonBy(tried, opponent(learner))) >
          worth(wonBy(tried, learner)) &&
          !pendingWin(tried.board)));
    if (cost && rookWins) {
      const goals = goalSquares(all, landing.target, landing.gain);
      const piece = PIECE_NAME[landing.piece];
      return ending(
        cut.map((frame, index) => {
          const square = goals[index];
          return square
            ? { ...frame, goal: { square, piece, rook: true as const } }
            : frame;
        }),
        cost,
      );
    }
  }

  // A try that costs nothing: the try and Rook's answer, then what it
  // missed, with the missed prize as the goal. The move that wins it is
  // never named.
  const short = all.slice(0, 2);
  const last = short.at(-1) ?? first;
  const triedSan = play(new Chess(fen), first.moveUci)?.san ?? first.moveUci;
  const cost = costFrame(fen, short, learner, instead, standing) ?? {
    fen: last.fen,
    moveUci: "",
    by: "rook" as const,
    arrows: [],
    outlines: [],
    control: [],
    caption: STANDING[standing](triedSan),
  };
  const prize = cost.caption.includes("missed a chance")
    ? cost.outlines[0]?.square
    : undefined;
  const prizePiece = prize ? new Chess(last.fen).get(prize) : undefined;
  if (!prize || !prizePiece) return ending(short, cost);
  // The prize may itself move on the last step, so trace back through all.
  const goals = goalSquares(short, prize, short.length);
  return ending(
    short.map((frame, index) => {
      const square = goals[index];
      return square
        ? { ...frame, goal: { square, piece: PIECE_NAME[prizePiece.type] } }
        : frame;
    }),
    cost,
  );
}

// "Why does it work?" (PRD §5.8): the first move's frame states the point,
// then the line plays only until the point lands and material settles, with
// quiet moves named and nothing more, then the payoff. frames[i] plays
// moves[i]. Undefined when the line neither mates nor wins material once it
// settles: a quiet line has no point to show.
// Where a point lands in a line, and the piece it is after. The point is
// mate, else the learner's most valuable capture or promotion that leaves
// them ahead once the material settles: a queen trade before a fork is not
// the point, the fork is. An immediate recapture on the same square settles
// it, and the line plays on while Rook can win material straight back, so
// the result is never overstated.
function pointLanding(
  fen: string,
  frames: readonly StoryFrame[],
  learner: Color,
):
  | {
      readonly gain: number;
      readonly end: number;
      readonly target: Square;
      readonly piece: PieceSymbol;
    }
  | undefined {
  const board = new Chess(fen);
  const moves: Move[] = [];
  for (const frame of frames) {
    const move = play(board, frame.moveUci);
    if (!move) break;
    moves.push(move);
    if (board.isCheckmate()) {
      const king = piecesOf(board, opponent(learner)).find(
        ({ type }) => type === "k",
      );
      if (!king) return undefined;
      const gain = moves.length - 1;
      return { gain, end: gain, target: king.square, piece: "k" };
    }
  }
  // Where the material settles after the learner wins it at `gain`.
  const settled = (gain: number): number => {
    const after = new Chess(fen);
    for (const move of moves.slice(0, gain + 1)) after.move(move);
    let end = gain;
    for (;;) {
      const next = moves[end + 1];
      const last = moves[end];
      if (!next || !last) break;
      const recaptures = next.captured !== undefined && next.to === last.to;
      const rookWins = after.turn() !== learner && pendingWin(after);
      if (!recaptures && !rookWins) break;
      after.move(next);
      end += 1;
    }
    return end;
  };
  const gains = moves
    .map((move, index) => ({
      move,
      index,
      value:
        (move.captured ? PIECE_VALUE[move.captured] : 0) +
        (move.promotion ? PIECE_VALUE[move.promotion] - PIECE_VALUE.p : 0),
    }))
    .filter(({ move, value }) => move.color === learner && value > 0)
    .toSorted((a, b) => b.value - a.value || a.index - b.index);
  for (const { move, index } of gains) {
    const end = settled(index);
    // Count the captures for the side this point belongs to, which is Rook
    // in a Why not refutation.
    const own = frames.slice(0, end + 1).map((frame, at) => ({
      ...frame,
      by:
        moves[at]?.color === learner ? ("learner" as const) : ("rook" as const),
    }));
    if (payoffFrame(fen, own) === undefined) continue;
    return {
      gain: index,
      end,
      target: move.to,
      piece: move.captured ?? move.promotion ?? "p",
    };
  }
  return undefined;
}

const squareNamed = (name: string): Square | undefined =>
  SQUARES.find((square) => square === name);

// Where the goal piece stands after each move: traced back from where the
// point lands to where it started, then forward through the line.
function goalSquares(
  frames: readonly StoryFrame[],
  target: Square,
  gain: number,
): Square[] {
  const moves = frames.map(({ moveUci }) => moveUci);
  let start = target;
  for (let index = gain - 1; index >= 0; index--) {
    const uci = moves[index] ?? "";
    if (uci.slice(2, 4) === start)
      start = squareNamed(uci.slice(0, 2)) ?? start;
  }
  let current = start;
  return moves.map((uci, index) => {
    if (index <= gain && uci.slice(0, 2) === current)
      current = squareNamed(uci.slice(2, 4)) ?? current;
    return current;
  });
}

export function pointStoryboard(
  fen: string,
  line: readonly string[],
  learner?: Color,
):
  | {
      readonly frames: readonly StoryFrame[];
      readonly moves: readonly string[];
    }
  | undefined {
  const all = lineStoryboard(fen, line, learner);
  const [first] = all;
  if (!first) return undefined;
  const side = learner ?? new Chess(fen).turn();
  const landing = pointLanding(fen, all, side);
  if (!landing) return undefined;
  const goals = goalSquares(all, landing.target, landing.gain);
  const goalAt = (index: number): StoryGoal | undefined => {
    const square = goals[index];
    return square ? { square, piece: PIECE_NAME[landing.piece] } : undefined;
  };
  const kept = all
    .slice(0, landing.end + 1)
    .map((frame, index) =>
      index === 0 ? frame : plainQuiet(all[index - 1]?.fen ?? fen, frame),
    );
  const payoff = payoffFrame(fen, kept);
  const ends = kept.at(-1);
  const mates = ends ? new Chess(ends.fen).isCheckmate() : false;
  const san = sanOf(fen, first.moveUci);
  if (!san) return undefined;
  const result = mates
    ? `${san} leads to mate.`
    : payoff
      ? `${san} wins ${payoff.caption.replace(/^You've won /, "").replace(/\.$/, "")}.`
      : undefined;
  if (!result) return undefined;
  // The point is said on the first move's own frame, not a frame before it.
  const point: StoryFrame = {
    ...first,
    caption: `${result}${pointReason(fen, first.moveUci, mates)}`,
  };
  const steps = [point, ...kept.slice(1)].map((frame, index) => {
    const goal = goalAt(index);
    return goal ? { ...frame, goal } : frame;
  });
  return {
    frames: [...steps, ...(payoff && !mates ? [payoff] : [])],
    moves: line,
  };
}

// A move with nothing tactical about it: it takes nothing, gives no check,
// and leaves nothing Rook can win at once on the square it moved to.
export function isQuietMove(fen: string, uci: string): boolean {
  const board = new Chess(fen);
  const move = play(board, uci);
  if (!move) return false;
  if (move.captured || move.promotion || board.inCheck()) return false;
  return staticExchange(board, move.to, board.turn()) <= 0;
}

function sanOf(fen: string, uci: string): string | undefined {
  try {
    return play(new Chess(fen), uci)?.san;
  } catch {
    return undefined;
  }
}

// Why the first move works, in one short sentence after the result: the
// check that starts a mate, two pieces hit at once, or a piece with no
// defender.
function pointReason(fen: string, uci: string, mates: boolean): string {
  const board = new Chess(fen);
  const move = play(board, uci);
  if (!move) return "";
  const them = opponent(move.color);
  if (mates && move.san.includes("+")) return " It comes with check.";
  const hits = attackedBy(board, move.to).filter(
    ({ type, square }) =>
      type === "k" ||
      board.attackers(square, them).length === 0 ||
      PIECE_VALUE[type] > PIECE_VALUE[move.piece],
  );
  if (hits.length >= 2) return " It hits two pieces at once.";
  if (move.captured && board.attackers(move.to, them).length === 0)
    return " It has no defender.";
  if (move.san.includes("+")) return " It comes with check.";
  const threat = threatAfter(board, move.color);
  return threat ? ` It ${threat}.` : "";
}

// What a move threatens, from the other side's checked dangers: mate in one,
// or a piece it can win. "threatens mate with Qf7#".
function threatAfter(after: Chess, mover: Color): string | undefined {
  if (after.turn() === mover) return undefined;
  const facts = dangerFacts(after.fen()) ?? [];
  const mate = facts.find(({ kind }) => kind === "mate-threat");
  const mating = mate ? /with (\S+)\.$/.exec(mate.text)?.[1] : undefined;
  if (mating) return `threatens mate with ${mating}`;
  const win = facts.find(({ kind }) => kind === "wins-material");
  return win
    ? `threatens to win my ${PIECE_NAME[win.piece]} on ${win.target}`
    : undefined;
}

// A move in the middle of a tactic that is not a check, capture or threat
// is named and nothing more.
function plainQuiet(before: string, frame: StoryFrame): StoryFrame {
  const move = play(new Chess(before), frame.moveUci);
  if (!move) return frame;
  const after = new Chess(frame.fen);
  const threatens = attackedBy(after, move.to).some(
    ({ square, type }) =>
      type === "k" ||
      after.attackers(square, opponent(move.color)).length === 0 ||
      PIECE_VALUE[type] > PIECE_VALUE[move.piece],
  );
  const forced = frame.caption.startsWith("I have to play");
  if (move.captured || move.san.includes("+") || threatens || forced)
    return frame;
  return {
    ...frame,
    arrows: frame.arrows.filter(({ kind }) => kind === "preview"),
    outlines: [],
    control: [],
    caption:
      frame.by === "rook" ? `I answer ${move.san}.` : `Then ${move.san}.`,
  };
}
