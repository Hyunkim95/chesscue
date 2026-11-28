import { Chess, SQUARES, type Move, type Square } from "chess.js";

// "tried" marks a move the learner attempted that the board has undone.
export type BoardArrowKind =
  | "move"
  | "threat"
  | "control"
  | "tried"
  // The checks, captures and threats scan colours each kind of forcing move.
  | "scan-check"
  | "scan-capture"
  | "scan-threat"
  // Board-first moment overlays: earlier tries drawn faintly in their
  // feedback tier, a previewed move that is not played, and Rook's reply.
  | "ghost-missed"
  | "ghost-worse"
  | "ghost-costly"
  | "preview"
  | "reply"
  // What a moved piece attacks, in a storyboard frame.
  | "attack"
  // The next-move tool: Stockfish's best move and its other top moves.
  | "engine-best"
  | "engine-line";

export interface BoardArrow {
  readonly from: Square;
  readonly to: Square;
  readonly kind: BoardArrowKind;
  readonly offset?: number;
}

interface SquareCue {
  readonly square: Square;
  readonly glyph: "×" | "!" | "1" | "2";
  readonly label: string;
}

export interface BoardMoveCue {
  readonly arrows: readonly BoardArrow[];
  readonly squares?: readonly SquareCue[];
  readonly ghost?: Move;
}

export function moveArrow(move: Move): BoardArrow {
  return { from: move.from, to: move.to, kind: "move" };
}

export function openedPieceLine(
  after: Chess,
  move: Move,
  before = new Chess(move.before),
) {
  const shooters = after.attackers(move.from, move.color).flatMap((square) => {
    const piece = after.get(square);
    return piece &&
      square !== move.to &&
      (piece.type === "q" || piece.type === "r" || piece.type === "b")
      ? [{ square, type: piece.type }]
      : [];
  });
  for (const type of ["q", "r", "b"] as const) {
    for (const piece of shooters.filter((shooter) => shooter.type === type)) {
      const file = piece.square.charCodeAt(0);
      const rank = Number(piece.square[1]);
      const dx = Math.sign(move.from.charCodeAt(0) - file);
      const dy = Math.sign(Number(move.from[1]) - rank);
      let target: Square | undefined;
      let guardsMove = false;
      for (let step = 1; step < 8; step++) {
        const nextFile = file - 97 + dx * step;
        const nextRank = rank + dy * step;
        if (nextFile < 0 || nextFile > 7 || nextRank < 1 || nextRank > 8) break;
        const next = SQUARES[(8 - nextRank) * 8 + nextFile];
        if (!next) break;
        if (after.get(next)) {
          guardsMove =
            next === move.to &&
            after.attackers(next, move.color).includes(piece.square);
          break;
        }
        if (!before.attackers(next, move.color).includes(piece.square))
          target = next;
      }
      if (target)
        return { piece, target: guardsMove ? move.to : target, guardsMove };
    }
  }
  return undefined;
}

export function pawnTargetAfterMove(board: Chess, move: Move) {
  if (move.piece !== "p") return undefined;
  return board
    .board()
    .flat()
    .find(
      (piece) =>
        piece?.color === board.turn() &&
        piece.type === "p" &&
        board.attackers(piece.square, move.color).includes(move.to),
    );
}

export function openedPawnExchange(
  board: Chess,
  move: Move,
  opened = openedPieceLine(board, move),
) {
  const target = pawnTargetAfterMove(board, move);
  if (board.fen() !== move.after || !opened?.guardsMove || !target)
    return undefined;
  const capture = board
    .moves({ verbose: true })
    .find(
      (reply) =>
        reply.from === target.square &&
        reply.to === move.to &&
        reply.captured === "p",
    );
  if (!capture) return undefined;
  const recapture = new Chess(capture.after)
    .moves({ verbose: true })
    .find(
      (reply) =>
        reply.from === opened.piece.square &&
        reply.to === move.to &&
        reply.captured === "p",
    );
  return recapture ? { target: target.square, capture, recapture } : undefined;
}

export function legalBoardLine(fen: string, moves: readonly string[]): Move[] {
  const line: Move[] = [];
  try {
    const board = new Chess(fen);
    for (const uci of moves) {
      if (board.isGameOver()) break;
      const move = board.move(uci);
      if (move.lan !== uci) break;
      line.push(move);
    }
  } catch {
    // Keep the legal prefix of the supplied continuation.
  }
  return line;
}

export function beforeMoveHint(move: Move): {
  readonly squares: readonly Square[];
  readonly text: string;
} {
  const after = new Chess(move.after);
  const king = after.findPiece({ type: "k", color: after.turn() })[0];
  if (king && after.isCheckmate()) {
    return {
      squares: [king],
      text: "Look at the king. Which squares could it escape to?",
    };
  }
  const cue = boardMoveCue(after, move);
  const targets = cue?.squares?.filter(
    ({ glyph }) => glyph === "1" || glyph === "2",
  );
  if (targets?.length) {
    return {
      squares: targets.map(({ square }) => square),
      text: "Look at the two marked targets. Can one piece attack both?",
    };
  }
  if (king && after.isCheck()) {
    return {
      squares: [king],
      text: "Look at the opposing king. Which checks are available?",
    };
  }
  if (move.captured && !move.isEnPassant()) {
    return {
      squares: [move.to],
      text: "Look at the marked piece. Can you take it safely?",
    };
  }
  const before = new Chess(move.before);
  const squares = SQUARES.filter(
    (square) =>
      square !== move.from &&
      square !== move.to &&
      !before.isAttacked(square, move.color) &&
      after.attackers(square, move.color).includes(move.to),
  ).slice(0, 2);
  return {
    squares,
    text: squares.length
      ? "Look at the marked squares. How could you gain control of them?"
      : "Look for a move that improves your position without leaving a piece exposed.",
  };
}

export function boardMoveCue(
  board: Chess,
  move: Move,
  previous?: Move,
): BoardMoveCue | undefined {
  if (move.after !== board.fen()) return undefined;
  const king = board.findPiece({ type: "k", color: board.turn() })[0];
  const checks: BoardArrow[] =
    king && board.isCheck()
      ? board.attackers(king, move.color).map((from) => ({
          from,
          to: king,
          kind: "threat",
        }))
      : [];

  if (king && board.isCheckmate()) {
    const escapes = new Chess(board.fen());
    escapes.remove(king);
    const squares = SQUARES.filter(
      (square) =>
        square !== king &&
        Math.abs(square.charCodeAt(0) - king.charCodeAt(0)) <= 1 &&
        Math.abs(Number(square[1]) - Number(king[1])) <= 1,
    ).map((square): SquareCue => {
      const blockers = escapes.attackers(square, move.color);
      return {
        square,
        glyph: "×",
        label:
          board.get(square)?.color === board.turn()
            ? `The king’s own piece occupies ${square}.`
            : `${square} is covered${blockers.length ? ` from ${blockers.join(", ")}` : ""}.`,
      };
    });
    return { arrows: [moveArrow(move), ...checks], squares };
  }

  if (
    move.captured &&
    !move.isEnPassant() &&
    previous?.after === move.before &&
    previous.to !== move.to
  ) {
    const before = new Chess(previous.before);
    const exposed = new Chess(move.before);
    if (
      before.get(move.to)?.color === previous.color &&
      before.attackers(move.to, previous.color).includes(previous.from) &&
      !exposed.isAttacked(move.to, previous.color) &&
      board.get(previous.from) === undefined
    ) {
      return {
        arrows: [
          moveArrow(move),
          { from: previous.from, to: move.to, kind: "threat" },
        ],
        squares: [
          {
            square: move.to,
            glyph: "!",
            label: `The move from ${previous.from} left ${move.to} undefended.`,
          },
        ],
        ghost: previous,
      };
    }
  }

  const directCheck = checks.find(({ from }) => from === move.to);
  if (directCheck) {
    const before = new Chess(move.before);
    const target = board
      .board()
      .flat()
      .find(
        (piece) =>
          piece?.color === board.turn() &&
          (piece.type === "q" || piece.type === "r") &&
          board.attackers(piece.square, move.color).includes(move.to) &&
          !before.attackers(piece.square, move.color).includes(move.from),
      );
    if (
      target &&
      !board.moves({ verbose: true }).some(({ to }) => to === move.to)
    ) {
      return {
        arrows: [
          directCheck,
          { from: move.to, to: target.square, kind: "control" },
        ],
        squares: [
          { square: directCheck.to, glyph: "1", label: "King in check." },
          {
            square: target.square,
            glyph: "2",
            label: `The same piece also attacks the ${target.type === "q" ? "queen" : "rook"}.`,
          },
        ],
      };
    }
  }

  if (checks.length || move.captured)
    return { arrows: [moveArrow(move), ...checks] };
  const opened = openedPieceLine(board, move);
  if (opened) {
    const target = pawnTargetAfterMove(board, move);
    return {
      arrows: [
        moveArrow(move),
        {
          from: opened.piece.square,
          to: opened.target,
          kind: "control",
          offset: 0.12,
        },
        ...(target
          ? [{ from: move.to, to: target.square, kind: "threat" } as const]
          : []),
      ],
    };
  }
  return undefined;
}
