import { Chess, type Color, type Move, type Square } from "chess.js";

import type { BoardArrow } from "./board-move-cues";
import { PIECE_VALUE, attackedBy, opponent } from "./board-relations";
import { centreControlChange } from "./centre-control";

// "Show, don't tell": a verified line as board frames. Each frame is one move
// with arrows to what it attacks and a one-line caption, so the explanation
// happens on the board. Rook speaks in the first person about his own pieces.

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

const NAME = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
} as const;

// The learner's moves a storyboard covers, matching the explanation reach.
export const STORY_LEARNER_MOVES = 3;
const MAX_TARGETS = 3;

function joined(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1) ?? ""}`;
}

function learnerFrame(after: Chess, move: Move): StoryFrame {
  const quiet = centreControlChange(move.before, move.lan);
  const them = opponent(move.color);
  if (after.isCheckmate()) {
    const kings = after.findPiece({ type: "k", color: them });
    return {
      fen: after.fen(),
      moveUci: move.lan,
      by: "learner",
      arrows: [
        { from: move.from, to: move.to, kind: "preview" },
        ...kings
          .filter((king) => after.attackers(king, move.color).includes(move.to))
          .map((king) => ({
            from: move.to,
            to: king,
            kind: "attack" as const,
          })),
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
  const hits = targets.map(({ type, square }) =>
    type === "k"
      ? "checks my king"
      : `attacks my ${NAME[type]} on ${square}${after.attackers(square, them).length === 0 ? ", which nothing defends" : ""}`,
  );
  const took = move.captured ? `takes my ${NAME[move.captured]}` : undefined;
  const parts = [...(took ? [took] : []), ...hits];
  // A quiet move is shown by the central squares it takes control of.
  const gained = parts.length === 0 ? quiet.gained : [];
  return {
    fen: after.fen(),
    moveUci: move.lan,
    by: "learner",
    arrows: [
      { from: move.from, to: move.to, kind: "preview" },
      ...targets.map(({ square }) => ({
        from: move.to,
        to: square,
        kind: "attack" as const,
      })),
    ],
    outlines: targets.map(({ square }) => ({ square, tone: "coral" as const })),
    control: gained.map((square) => ({ square, change: "gained" as const })),
    caption:
      parts.length > 0
        ? `${move.san} ${joined(parts)}.`
        : gained.length > 0
          ? `${move.san} adds control of ${joined(gained)} in the centre.`
          : `Then ${move.san}.`,
  };
}

function rookFrame(after: Chess, move: Move, forced: boolean): StoryFrame {
  return {
    fen: after.fen(),
    moveUci: move.lan,
    by: "rook",
    arrows: [{ from: move.from, to: move.to, kind: "reply" }],
    outlines: [],
    control: [],
    caption: forced
      ? `I have to play ${move.san}.`
      : move.captured
        ? `I take your ${NAME[move.captured]} with ${move.san}.`
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
    let move: Move;
    try {
      move = board.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
      });
    } catch {
      break;
    }
    frames.push(
      move.color === learnerColor
        ? learnerFrame(board, move)
        : rookFrame(board, move, forced),
    );
  }
  return frames;
}
