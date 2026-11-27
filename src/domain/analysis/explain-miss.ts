import { Chess, type Color, type Move, type Square } from "chess.js";

import {
  PIECE_VALUE,
  attackedBy,
  fileOf,
  lineHits,
  linesFor,
  material,
  opponent,
  piecesOf,
  pinnedToKing,
  rankOf,
  squareAt,
} from "./board-relations";
import { isMateScore } from "./classify-experiment";

// Explains a missed tactic from a checked line without a language model. Every
// sentence restates a relation chess.js found by replaying the line. The
// ranking is by fact kind, not by motif.

export const MISSED_LINE_WORDING_VERSION = "missed-line-facts/1";

type FactKind =
  | "mate"
  | "double-attack"
  | "skewer"
  | "pin"
  | "line"
  | "discovered"
  | "capture-free"
  | "capture"
  | "check";

interface Fact {
  readonly kind: FactKind;
  readonly text: string;
  readonly value: number;
  readonly move: number;
  readonly ply: number;
}

export interface MissedLineExplanation {
  readonly text: string;
}

// Most tactics pay off within three learner moves. When they do not, the
// explanation reads five, so the shorter and less noisy reading wins when both
// apply.
const SHORT_LINE = 3;
const LONG_LINE = 5;
const SETUP: readonly FactKind[] = [
  "mate",
  "double-attack",
  "skewer",
  "pin",
  "line",
  "discovered",
  "capture-free",
  "capture",
  "check",
];
const TACTIC = new Set<FactKind>([
  "double-attack",
  "skewer",
  "pin",
  "line",
  "discovered",
]);
const NAME = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
} as const;
const SIDE = { w: "White", b: "Black" } as const;

function named(board: Chess, square: Square): string {
  const piece = board.get(square);
  return piece
    ? `the ${SIDE[piece.color].toLowerCase()} ${NAME[piece.type]} on ${square}`
    : square;
}

function moveFacts(
  before: Chess,
  after: Chess,
  move: Move,
  wonLater: ReadonlySet<Square>,
): Omit<Fact, "move" | "ply">[] {
  const them = opponent(move.color);
  const facts: Omit<Fact, "move" | "ply">[] = [];
  const add = (kind: FactKind, text: string, value = 0) =>
    facts.push({ kind, text, value });
  const pinned = (square: Square) =>
    after.get(square)?.type !== "k" && pinnedToKing(after, square, them);
  const undefended = (square: Square) =>
    after.attackers(square, them).length === 0 && !pinned(square);
  const mate = after.isCheckmate();

  if (mate) {
    const [king] = after.findPiece({ type: "k", color: them });
    const blockers: Square[] = [];
    if (king)
      for (const df of [-1, 0, 1])
        for (const dr of [-1, 0, 1]) {
          const square = squareAt(fileOf(king) + df, rankOf(king) + dr);
          if ((df || dr) && square && after.get(square)?.color === them)
            blockers.push(square);
        }
    add(
      "mate",
      `${move.san} is checkmate.` +
        (king && blockers.length >= 2
          ? ` The king on ${king} is boxed in by its own pieces on ${blockers.join(", ")}.`
          : ""),
      1000,
    );
  }
  if (move.captured) {
    const free = before.attackers(move.to, them).length === 0;
    add(
      free ? "capture-free" : "capture",
      `${move.san} takes the ${SIDE[them].toLowerCase()} ${NAME[move.captured]} on ${move.to}` +
        (free ? ", which had no defender." : "."),
      PIECE_VALUE[move.captured],
    );
  }
  if (after.inCheck() && !mate) add("check", `${move.san} gives check.`);

  const targets = attackedBy(after, move.to).filter(
    ({ square, type }) =>
      type === "k" ||
      (type !== "p" &&
        (PIECE_VALUE[type] > PIECE_VALUE[move.piece] || undefended(square))),
  );
  if (targets.length >= 2 && !mate)
    add(
      "double-attack",
      `${move.san} attacks ${targets
        .map(
          ({ square, type }) =>
            named(after, square) +
            (type !== "k" && undefended(square) ? " (undefended)" : ""),
        )
        .join(" and ")} at the same time.`,
      Math.max(
        ...targets.map(({ type }) => (type === "k" ? 0 : PIECE_VALUE[type])),
      ),
    );

  for (const { square, type } of attackedBy(after, move.to))
    if (type !== "p" && pinned(square))
      add(
        "pin",
        `${move.san} attacks ${named(after, square)}, which is pinned to its king.`,
        PIECE_VALUE[type],
      );
  // Checked against the legal moves, since a pinned piece can still take
  // along its line.
  for (const square of after.attackers(move.to, them))
    if (
      pinned(square) &&
      !after.moves({ square, verbose: true }).some(({ to }) => to === move.to)
    )
      add(
        "pin",
        `${named(after, square)} cannot capture on ${move.to} because it is pinned to its king.`,
      );

  for (const direction of mate ? [] : linesFor(move.piece)) {
    const [front, back] = lineHits(after, move.to, direction);
    const a = front && after.get(front);
    const b = back && after.get(back);
    if (!front || !back || !a || !b) continue;
    if (
      a.color !== them ||
      b.color !== them ||
      a.type === "p" ||
      b.type === "p"
    )
      continue;
    // A line matters when the king is on it or the line later wins a piece.
    if (
      a.type !== "k" &&
      b.type !== "k" &&
      !wonLater.has(front) &&
      !wonLater.has(back)
    )
      continue;
    const text = `${move.san} lines up ${named(after, front)} with ${named(after, back)} behind it.`;
    if (PIECE_VALUE[a.type] > PIECE_VALUE[b.type])
      add("skewer", text, PIECE_VALUE[b.type]);
    else if (PIECE_VALUE[a.type] < PIECE_VALUE[b.type] && b.type !== "k")
      add("line", text, PIECE_VALUE[a.type]);
  }

  for (const { square, type } of piecesOf(after, move.color)) {
    if (square === move.to || !linesFor(type).length) continue;
    if (before.get(square)?.type !== type) continue;
    const earlier = new Set(
      attackedBy(before, square).map((piece) => piece.square),
    );
    for (const target of attackedBy(after, square))
      if (target.type !== "p" && !earlier.has(target.square))
        add(
          "discovered",
          `Moving the ${NAME[move.piece]} off ${move.from} opens the line for ${named(after, square)}, which now attacks ${named(after, target.square)}.`,
          target.type === "k" ? 0 : PIECE_VALUE[target.type],
        );
  }
  return facts;
}

const rank = (fact: Fact) => SETUP.indexOf(fact.kind);
const lower = (text: string) =>
  text.startsWith("Moving") ? "moving" + text.slice(6) : text;

function verdict(bestCp: number, playedCp: number): string {
  if (bestCp > 0 && isMateScore(bestCp))
    return ", which misses a forced checkmate";
  if (playedCp < 0 && isMateScore(playedCp)) return ", which allows checkmate";
  return `, which Stockfish rates ${((bestCp - playedCp) / 100).toFixed(1)} pawns worse`;
}

function lineOutcome(start: Chess, end: Chess, us: Color) {
  return {
    gain:
      material(end, us) -
      material(end, opponent(us)) -
      (material(start, us) - material(start, opponent(us))),
    mated: end.isCheckmate(),
  };
}

// Whether the better line is a tactic: within the replayed moves it mates or
// wins at least two points of material. A quiet defensive line is not.
export function isTacticLine(fen: string, line: readonly string[]): boolean {
  return [SHORT_LINE, LONG_LINE].some((learnerMoves) => {
    try {
      const board = new Chess(fen);
      const start = new Chess(fen);
      const us = board.turn();
      for (const uci of line.slice(0, learnerMoves * 2 - 1)) {
        if (board.isGameOver()) break;
        board.move(uci);
      }
      const { gain, mated } = lineOutcome(start, board, us);
      return mated || gain >= 2;
    } catch {
      return false;
    }
  });
}

// `line` starts with the better move. Scores are from the learner's side:
// the better move's evaluation and the played move's evaluation. Returns
// undefined when the line is not a tactic: it neither mates nor wins at least
// two points of material within five learner moves.
// "short" reads three learner moves, "long" reads five. Review tries the short
// reading, then its move-consequence plan, then the long reading, because the
// plan explains deliberate sacrifices better than a five-move fact list.
export function explainMissedLine(
  input: MissedLineInput,
  reach: "short" | "long" | "short-then-long" = "short-then-long",
): MissedLineExplanation | undefined {
  if (reach === "short") return explainWithin(input, SHORT_LINE);
  if (reach === "long") return explainWithin(input, LONG_LINE);
  return explainWithin(input, SHORT_LINE) ?? explainWithin(input, LONG_LINE);
}

interface MissedLineInput {
  readonly fen: string;
  readonly line: readonly string[];
  readonly playedSan?: string;
  readonly scores?: { readonly bestCp: number; readonly playedCp: number };
}

function explainWithin(
  input: MissedLineInput,
  learnerMoves: number,
): MissedLineExplanation | undefined {
  let board: Chess;
  const moves: Move[] = [];
  const boards: Chess[] = [];
  try {
    board = new Chess(input.fen);
    boards.push(new Chess(board.fen()));
    for (const uci of input.line.slice(0, learnerMoves * 2 - 1)) {
      if (board.isGameOver()) break;
      moves.push(board.move(uci));
      boards.push(new Chess(board.fen()));
    }
  } catch {
    return undefined;
  }
  const [firstMove] = moves;
  const start = boards[0];
  if (!firstMove || !start) return undefined;
  const us = firstMove.color;
  const { gain, mated } = lineOutcome(start, board, us);
  // Only a line whose payoff is inside the replayed moves is explained here.
  // Longer combinations keep the move-consequence plan.
  if (!mated && gain < 2) return undefined;

  const facts: Fact[] = [];
  moves.forEach((move, index) => {
    const before = boards[index];
    const after = boards[index + 1];
    if (index % 2 || !before || !after) return;
    const wonLater = new Set(
      moves
        .filter((m, i) => i > index && i % 2 === 0 && m.captured)
        .map((m) => m.to),
    );
    for (const fact of moveFacts(before, after, move, wonLater))
      facts.push({ ...fact, move: index / 2 + 1, ply: index });
  });

  const first = facts
    .filter((fact) => fact.move === 1)
    .toSorted((a, b) => rank(a) - rank(b) || b.value - a.value);
  const setup = first[0];
  const later = facts.filter((fact) => fact.move > 1);
  const payoff =
    setup?.kind === "mate"
      ? undefined
      : (later.find((fact) => fact.kind === "mate") ??
        later
          .filter((fact) => fact.kind.startsWith("capture"))
          .toSorted((a, b) => b.value - a.value)[0]);
  // When the first move only checks or captures, the tactic may come on a
  // later move, before or with the payoff.
  const bridge =
    setup && TACTIC.has(setup.kind)
      ? undefined
      : later
          .filter(
            (fact) =>
              TACTIC.has(fact.kind) && (!payoff || fact.move <= payoff.move),
          )
          .toSorted((a, b) => a.move - b.move || rank(a) - rank(b))[0];

  const parts = [setup?.text ?? `${firstMove.san} was the stronger move.`];
  // Name every move between the last fact shown and the next, so no move in
  // the line is skipped silently.
  let shownPly = setup ? 0 : -1;
  const lead = (fact: Fact) => {
    const between = moves.slice(shownPly + 1, fact.ply);
    shownPly = fact.ply;
    const [only] = between;
    if (between.length === 1 && only)
      return `After ${SIDE[only.color]} replies ${only.san}, `;
    return between.length
      ? `After ${between.map(({ san }) => san).join(" ")}, `
      : "";
  };
  if (bridge) parts.push(lead(bridge) + lower(bridge.text));
  if (payoff)
    parts.push(
      bridge?.ply === payoff.ply
        ? payoff.text
        : lead(payoff) + lower(payoff.text),
    );
  if (!mated)
    parts.push(`${SIDE[us]} ends up ${String(gain)} points of material ahead.`);
  if (input.playedSan)
    parts.push(
      `You played ${input.playedSan} instead` +
        (input.scores
          ? verdict(input.scores.bestCp, input.scores.playedCp)
          : "") +
        ".",
    );
  return { text: parts.join(" ") };
}
