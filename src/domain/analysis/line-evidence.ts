import { Chess, type Color, type Move, type Square } from "chess.js";
import {
  PIECE_VALUE as VALUE,
  attackedBy,
  lineHits,
  linesFor,
  material,
  opponent as other,
  piecesOf,
  pinnedToKing,
  rankOf,
  fileOf,
  squareAt,
} from "./board-relations";

// Board facts established by replaying a checked line. They name what the
// moves did, not which motif they belong to, so new motifs can be matched by
// example without new code.
export type LineEvidence =
  | { readonly ok: true; readonly facts: readonly string[] }
  | { readonly ok: false; readonly reason: "empty-line" | "illegal-line" };

// Enemy pieces the piece on `from` attacks that it could win: the king, a
// more valuable piece, or a piece with no defender.
function targetsFrom(board: Chess, from: Square): Square[] {
  const mover = board.get(from);
  if (!mover) return [];
  const them = other(mover.color);
  return piecesOf(board, them)
    .filter(
      ({ square, type }) =>
        board.attackers(square, mover.color).includes(from) &&
        (type === "k" ||
          VALUE[type] > VALUE[mover.type] ||
          board.attackers(square, them).length === 0),
    )
    .map(({ square }) => square);
}

// Enemy pieces other than pawns that the piece on `from` attacks.
function attackedFrom(board: Chess, from: Square): Square[] {
  return attackedBy(board, from)
    .filter(({ type }) => type !== "p")
    .map(({ square }) => square);
}

function lineFacts(board: Chess, from: Square, us: Color): string[] {
  const mover = board.get(from);
  if (!mover) return [];
  const facts: string[] = [];
  for (const direction of linesFor(mover.type)) {
    const [front, back] = lineHits(board, from, direction).map((square) =>
      board.get(square),
    );
    if (!front || !back || front.color === us || back.color === us) continue;
    if (front.type === "p" || back.type === "p") continue;
    if (VALUE[back.type] > VALUE[front.type]) facts.push("line-front-lower");
    if (VALUE[front.type] > VALUE[back.type]) facts.push("line-front-higher");
  }
  return facts;
}

function mateFacts(board: Chess, us: Color): string[] {
  const them = other(us);
  const [king] = board.findPiece({ type: "k", color: them });
  if (!king) return ["mate"];
  const facts = ["mate"];
  if (rankOf(king) === (them === "w" ? 0 : 7)) facts.push("mate-home-rank");
  for (const checker of board.attackers(king, us)) {
    const piece = board.get(checker);
    if (piece) facts.push("mate-by-" + piece.type);
    if (
      (piece?.type === "r" || piece?.type === "q") &&
      rankOf(checker) === rankOf(king)
    )
      facts.push("mate-along-rank");
  }
  let blocked = 0;
  for (const df of [-1, 0, 1])
    for (const dr of [-1, 0, 1]) {
      const square = squareAt(fileOf(king) + df, rankOf(king) + dr);
      if (square && square !== king && board.get(square)?.color === them)
        blocked++;
    }
  if (blocked >= 2) facts.push("mate-self-blocked");
  return facts;
}

function moveFacts(before: Chess, after: Chess, move: Move): string[] {
  const us = move.color,
    them = other(us);
  const facts: string[] = [];

  if (move.captured) {
    if (before.attackers(move.to, them).length === 0)
      facts.push("capture-undefended");
    else if (VALUE[move.captured] > VALUE[move.piece]) facts.push("capture-up");
    else facts.push("capture");
  }

  if (after.isCheckmate()) facts.push(...mateFacts(after, us));
  else if (after.inCheck()) facts.push("check");
  if (!move.captured && !after.inCheck()) facts.push("quiet");

  const targets = targetsFrom(after, move.to);
  if (targets.length >= 2) facts.push("double-attack");
  if (
    piecesOf(after, them).some(
      ({ square, type }) =>
        type !== "k" &&
        after.attackers(square, us).includes(move.to) &&
        pinnedToKing(after, square, them),
    )
  )
    facts.push("attacks-pinned");
  // A piece that attacks the destination but cannot take because it is pinned.
  if (
    after
      .attackers(move.to, them)
      .some(
        (square) =>
          after.get(square)?.type !== "k" && pinnedToKing(after, square, them),
      )
  )
    facts.push("defender-pinned");
  facts.push(...lineFacts(after, move.to, us));

  for (const { square, type } of piecesOf(after, us)) {
    if (square === move.to || !linesFor(type).length) continue;
    if (before.get(square)?.type !== type) continue;
    const earlier = new Set(attackedFrom(before, square));
    for (const target of attackedFrom(after, square))
      if (!earlier.has(target))
        facts.push(
          after.get(target)?.type === "k"
            ? "discovered-check"
            : "discovered-attack",
        );
  }

  if (
    move.piece !== "k" &&
    VALUE[move.piece] >= 3 &&
    VALUE[move.captured ?? "p"] < VALUE[move.piece] - 1
  ) {
    const attackers = after.attackers(move.to, them);
    const cheapest = Math.min(
      ...attackers.map((square) => VALUE[after.get(square)?.type ?? "k"]),
    );
    if (
      attackers.length > 0 &&
      (after.attackers(move.to, us).length === 0 ||
        cheapest < VALUE[move.piece])
    )
      facts.push("offers-piece");
  }
  return facts;
}

// Replays up to `learnerMoves` moves by the side to move, with the replies
// between them, and records what each learner move did on the board.
export function lineEvidence(
  fen: string,
  line: readonly string[],
  learnerMoves = 3,
): LineEvidence {
  if (line.length === 0) return { ok: false, reason: "empty-line" };
  const board = new Chess(fen);
  const us = board.turn();
  const start = material(board, us) - material(board, other(us));
  const facts = new Set<string>();
  for (const [index, uci] of line.slice(0, learnerMoves * 2).entries()) {
    const before = new Chess(board.fen());
    let move: Move;
    try {
      move = board.move(uci);
    } catch {
      return { ok: false, reason: "illegal-line" };
    }
    // The first move is the decision the drill asks for. Later learner moves
    // are kept apart because a setup move often comes before the payoff.
    if (index % 2 === 0)
      for (const fact of moveFacts(before, board, move))
        facts.add(index === 0 ? fact : "then-" + fact);
    if (board.isGameOver()) break;
  }
  const gain = material(board, us) - material(board, other(us)) - start;
  if (gain >= 2) facts.add("wins-material");
  if (gain >= 5) facts.add("wins-major-material");
  return { ok: true, facts: [...facts].sort() };
}
