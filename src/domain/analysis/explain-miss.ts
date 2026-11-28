import { Chess, type Color, type Move, type Square } from "chess.js";

import {
  PIECE_NAME,
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
  staticExchange,
} from "./board-relations";
import { isMateScore } from "./classify-experiment";

// Explains a missed tactic from a checked line without a language model. Every
// sentence restates a relation chess.js found by replaying the line. The
// ranking is by fact kind, not by motif.

export const MISSED_LINE_WORDING_VERSION = "missed-line-facts/8";
export const ALLOWED_LINE_WORDING_VERSION = "allowed-line-facts/6";
// What counts as a tactic line (tacticKind, isTacticLine). Progress and the
// curriculum derive units from it, so a change to the rule bumps this.
// 2: material is counted once the line's exchanges settle.
export const TACTIC_LINE_VERSION = "tactic-line/3";

type FactKind =
  | "mate"
  | "double-attack"
  | "skewer"
  | "pin"
  | "trapped"
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
// Plies without a capture or promotion after which the material is settled.
const STABLE_PLIES = 4;
const LONG_LINE = 5;
// A pin or a trap can take one more move to pay off; read only when the
// shorter readings find nothing.
const LONGEST_LINE = 6;
const READINGS = [SHORT_LINE, LONG_LINE, LONGEST_LINE] as const;
// After a gain, this many plies without a capture mean the opponent had two
// moves to win it back and could not.
const HELD_PLIES = 3;
// At most this many moves are named in one "After …" clause.
const NAMED_MOVES = 3;
const LATER = "Later in the line, ";
const SETUP: readonly FactKind[] = [
  "mate",
  "double-attack",
  "skewer",
  "pin",
  "trapped",
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
  "trapped",
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

// The viewer's own pieces are "your"; the other side's are named by colour.
function pieceOf(
  color: Color,
  type: keyof typeof NAME,
  viewer: Color | undefined,
): string {
  return color === viewer
    ? `your ${NAME[type]}`
    : `the ${SIDE[color].toLowerCase()} ${NAME[type]}`;
}

function named(board: Chess, square: Square, viewer?: Color): string {
  const piece = board.get(square);
  return piece
    ? `${pieceOf(piece.color, piece.type, viewer)} on ${square}`
    : square;
}

// A back-rank mate: a rook or queen checks along the king's home rank and
// every square in front of the king holds one of its own pieces.
function mateText(
  board: Chess,
  move: Move,
  king: Square | undefined,
  blockers: readonly Square[],
): string {
  const mated = `${move.san} is checkmate.`;
  if (!king || blockers.length < 2) return mated;
  const them = opponent(move.color);
  const home = them === "w" ? 0 : 7;
  const forward = home === 0 ? 1 : -1;
  const front = [-1, 0, 1].flatMap((df) => {
    const square = squareAt(fileOf(king) + df, home + forward);
    return square ? [square] : [];
  });
  const alongRank = board.attackers(king, move.color).some((square) => {
    const type = board.get(square)?.type;
    return (type === "r" || type === "q") && rankOf(square) === home;
  });
  if (
    rankOf(king) === home &&
    alongRank &&
    front.every((square) => board.get(square)?.color === them)
  )
    return `${move.san} is checkmate on the back rank. The king on ${king} is stuck behind its own pieces on ${front.join(", ")}.`;
  return `${mated} The king on ${king} is boxed in by its own pieces on ${blockers.join(", ")}.`;
}

function moveFacts(
  before: Chess,
  after: Chess,
  move: Move,
  wonLater: ReadonlySet<Square>,
  viewer: Color | undefined,
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
    add("mate", mateText(after, move, king, blockers), 1000);
  }
  if (move.captured) {
    const free = before.attackers(move.to, them).length === 0;
    add(
      free ? "capture-free" : "capture",
      `${move.san} takes ${pieceOf(them, move.captured, viewer)} on ${move.to}` +
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
            named(after, square, viewer) +
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
        `${move.san} attacks ${named(after, square, viewer)}, which is pinned to its king.`,
        PIECE_VALUE[type],
      );
  // Checked against the legal moves, since a pinned piece can still take
  // along its line. The sentence starts with the move, like every other fact.
  for (const square of after.attackers(move.to, them))
    if (
      pinned(square) &&
      !after.moves({ square, verbose: true }).some(({ to }) => to === move.to)
    )
      add(
        "pin",
        move.captured
          ? `${move.san} takes ${pieceOf(them, move.captured, viewer)} on ${move.to}, and ${named(after, square, viewer)} cannot take back because it is pinned to its king.`
          : `${move.san} is safe from ${named(after, square, viewer)}, which is pinned to its king.`,
      );

  // A piece the move attacks with a cheaper one, that has no safe square.
  for (const { square, type } of mate ? [] : attackedBy(after, move.to))
    if (
      type !== "k" &&
      type !== "p" &&
      PIECE_VALUE[move.piece] < PIECE_VALUE[type] &&
      trapped(after, square)
    )
      add(
        "trapped",
        `${move.san} attacks ${named(after, square, viewer)}, which has no safe square.`,
        PIECE_VALUE[type],
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
    const text = `${move.san} lines up ${named(after, front, viewer)} with ${named(after, back, viewer)} behind it.`;
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
          `Moving the ${NAME[move.piece]} off ${move.from} opens the line for ${named(after, square, viewer)}, which now attacks ${named(after, target.square, viewer)}.`,
          target.type === "k" ? 0 : PIECE_VALUE[target.type],
        );
  }
  return facts;
}

// Every move of the piece on `square` (its side to move) loses it: the
// square it reaches is attacked by a cheaper piece, or attacked and not
// defended, unless the move takes something worth as much.
function trapped(board: Chess, square: Square): boolean {
  const piece = board.get(square);
  // In check, the piece's few legal moves are about the check, not a trap.
  if (piece?.color !== board.turn() || board.inCheck()) return false;
  const them = opponent(piece.color);
  return board.moves({ square, verbose: true }).every((move) => {
    if (move.captured && PIECE_VALUE[move.captured] >= PIECE_VALUE[piece.type])
      return false;
    const after = new Chess(move.after);
    const attackers = after.attackers(move.to, them);
    return (
      attackers.some((from) => {
        const by = after.get(from);
        return (
          by !== undefined && PIECE_VALUE[by.type] < PIECE_VALUE[piece.type]
        );
      }) ||
      (attackers.length > 0 &&
        after.attackers(move.to, piece.color).length === 0)
    );
  });
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

function lineOutcome(start: Chess, end: Chess, us: Color, takeBack?: TakeBack) {
  const owed = takeBack ? (takeBack.by === us ? 1 : -1) * takeBack.points : 0;
  const balance = material(end, us) - material(end, opponent(us)) + owed;
  return {
    gain: balance - (material(start, us) - material(start, opponent(us))),
    balance,
    mated: end.isCheckmate(),
  };
}

const points = (n: number) => `${String(n)} point${n === 1 ? "" : "s"}`;

// The gain is only "ahead" when the position started level; otherwise the
// sentence says what the line wins and where the material ends up.
function materialText(side: string, gain: number, balance: number): string {
  if (balance === gain)
    return `${side} ends up ${points(gain)} of material ahead.`;
  const won = `${side} wins ${points(gain)} of material`;
  if (balance === 0) return `${won} and levels the material.`;
  return balance > 0
    ? `${won} and ends up ${points(balance)} ahead.`
    : `${won} but is still ${points(-balance)} behind.`;
}

// Replays `learnerMoves` moves of the side that starts the line, then goes on
// until the material settles: the line makes no capture or promotion for
// STABLE_PLIES plies, so a take-back after an in-between check counts too.
// `boards[i]` is the position after `i` moves; `plies` is the usual reach.
// What the side to move wins back when a line runs out on a capture.
interface TakeBack {
  readonly by: Color;
  readonly square: Square;
  readonly points: number;
}

const changesMaterial = (move: Move | undefined) =>
  move?.captured !== undefined || move?.promotion !== undefined;

// Where a gain that held is given back by choice: the opponent made two
// moves without winning material back, and the learner then gives up a
// piece for a cheaper one (a sacrifice for an attack). The count stops
// before it, since the move already won what the line later invests.
function givenBack(fen: string, played: readonly Move[]): number | undefined {
  const [first] = played;
  if (!first) return undefined;
  const us = first.color;
  const start = new Chess(fen);
  const board = new Chess(fen);
  let lastChange = -1;
  for (const [index, move] of played.entries()) {
    if (
      move.color === us &&
      move.captured !== undefined &&
      lastChange >= 0 &&
      index - lastChange - 1 >= HELD_PLIES &&
      PIECE_VALUE[move.piece] > PIECE_VALUE[move.captured] &&
      lineOutcome(start, board, us).gain >= 2
    ) {
      const after = new Chess(board.fen());
      after.move(move.lan);
      if (after.attackers(move.to, opponent(us)).length > 0) return index;
    }
    if (changesMaterial(move)) lastChange = index;
    board.move(move.lan);
  }
  return undefined;
}

function settledLine(
  fen: string,
  line: readonly string[],
  learnerMoves: number,
):
  | {
      readonly moves: Move[];
      readonly boards: Chess[];
      readonly plies: number;
      readonly takeBack: TakeBack | undefined;
    }
  | undefined {
  const plies = learnerMoves * 2 - 1;
  const played: Move[] = [];
  try {
    const replay = new Chess(fen);
    for (const uci of line) {
      if (replay.isGameOver()) break;
      played.push(replay.move(uci));
    }
  } catch {
    // The line ends at its first illegal move.
    if (played.length < Math.min(plies, line.length)) return undefined;
  }
  let end = Math.min(plies, played.length);
  for (
    let index = end;
    index < played.length && index < end + STABLE_PLIES;
    index += 1
  ) {
    if (changesMaterial(played[index])) end = index + 1;
  }
  end = Math.min(end, givenBack(fen, played) ?? end);
  const moves = played.slice(0, end);
  const board = new Chess(fen);
  const boards: Chess[] = [new Chess(fen)];
  for (const move of moves) {
    board.move(move.lan);
    boards.push(new Chess(board.fen()));
  }
  // A line that runs out on a capture is not settled: the side to move
  // takes back what the static exchange on that square wins.
  const last = moves.at(-1);
  const owed =
    last?.captured !== undefined && end === played.length && !board.isGameOver()
      ? staticExchange(board, last.to, board.turn())
      : 0;
  return {
    moves,
    boards,
    plies,
    takeBack:
      last && owed > 0
        ? { by: board.turn(), square: last.to, points: owed }
        : undefined,
  };
}

// A line wins material when it gains at least two points within the usual
// reach and still does once the material settles.
function winsWithin(
  start: Chess,
  boards: readonly Chess[],
  plies: number,
  us: Color,
  takeBack?: TakeBack,
): { readonly wins: boolean; readonly mated: boolean } {
  const end = boards.at(-1) ?? start;
  const index = Math.min(plies, boards.length - 1);
  const reached = boards[index] ?? start;
  const settled = lineOutcome(start, end, us, takeBack);
  const within = lineOutcome(
    start,
    reached,
    us,
    index === boards.length - 1 ? takeBack : undefined,
  );
  return {
    wins: settled.gain >= 2 && (within.mated || within.gain >= 2),
    mated: settled.mated,
  };
}

// What the better line wins within the replayed moves: a forced mate, at
// least two points of material, or nothing (a quiet line). The material is
// counted once it settles, like the explanations' (TACTIC_LINE_VERSION).
export function tacticKind(
  fen: string,
  line: readonly string[],
): "mate" | "material" | undefined {
  const outcomes = READINGS.flatMap((learnerMoves) => {
    const settled = settledLine(fen, line, learnerMoves);
    const [first] = settled?.moves ?? [];
    if (!settled || !first) return [];
    return [
      winsWithin(
        new Chess(fen),
        settled.boards,
        settled.plies,
        first.color,
        settled.takeBack,
      ),
    ];
  });
  if (outcomes.some(({ mated }) => mated)) return "mate";
  if (outcomes.some(({ wins }) => wins)) return "material";
  return undefined;
}

// The material the side to move comes out with over the whole line, in
// pawns. Zero when the line cannot be played.
export function lineMaterialGain(fen: string, line: readonly string[]): number {
  try {
    const board = new Chess(fen);
    const start = new Chess(fen);
    const us = board.turn();
    for (const uci of line) board.move(uci);
    return lineOutcome(start, board, us).gain;
  } catch {
    return 0;
  }
}

// Whether the better line is a tactic: within the replayed moves it mates or
// wins at least two points of material. A quiet defensive line is not.
export function isTacticLine(fen: string, line: readonly string[]): boolean {
  return tacticKind(fen, line) !== undefined;
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
  const long = () =>
    explainWithin(input, LONG_LINE) ?? explainWithin(input, LONGEST_LINE);
  if (reach === "long") return long();
  return explainWithin(input, SHORT_LINE) ?? long();
}

interface MissedLineInput {
  readonly fen: string;
  readonly line: readonly string[];
  readonly playedSan?: string;
  readonly scores?: { readonly bestCp: number; readonly playedCp: number };
}

interface LineReading {
  readonly firstMove: Move;
  // The strongest fact about the first move, if any.
  readonly setup: Fact | undefined;
  // A tactic on a later move, when the first move only checks or captures.
  readonly bridge: Fact | undefined;
  // The sentences after the first one: the tactic, the payoff and the
  // material.
  readonly rest: readonly string[];
}

// Replays `learnerMoves` moves of the side that starts the line and states
// what it wins. The viewer's pieces are named "your". The material is counted
// from `countFrom`, the line's start unless given.
function readLine(
  fen: string,
  line: readonly string[],
  learnerMoves: number,
  viewer?: Color,
  countFrom?: Chess,
): LineReading | undefined {
  const settled = settledLine(fen, line, learnerMoves);
  if (!settled) return undefined;
  const { moves, boards, plies, takeBack } = settled;
  const board = boards.at(-1);
  if (!board) return undefined;
  const [firstMove] = moves;
  const start = boards[0];
  if (!firstMove || !start) return undefined;
  const us = firstMove.color;
  const { gain, balance, mated } = lineOutcome(
    countFrom ?? start,
    board,
    us,
    takeBack,
  );
  // Only a line whose payoff is inside the usual reach is explained here, and
  // only if it still holds once the material settles. Longer combinations
  // keep the move-consequence plan.
  if (
    !mated &&
    !winsWithin(countFrom ?? start, boards, plies, us, takeBack).wins
  )
    return undefined;

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
    for (const fact of moveFacts(before, after, move, wonLater, viewer))
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
          .filter(
            (fact) =>
              fact.kind.startsWith("capture") && !traded(moves, fact.ply),
          )
          .toSorted((a, b) => b.value - a.value)[0]);
  // When the first move only checks or captures, the tactic may come on a
  // later move, before or with the payoff.
  const bridge =
    setup && TACTIC.has(setup.kind)
      ? undefined
      : later
          .filter(
            (fact) =>
              TACTIC.has(fact.kind) &&
              !traded(moves, fact.ply) &&
              (!payoff || fact.move <= payoff.move),
          )
          .toSorted((a, b) => a.move - b.move || rank(a) - rank(b))[0];

  // A first move with nothing to name and a tactic several moves later is
  // not one lesson.
  if (!setup && bridge && bridge.ply - 1 > NAMED_MOVES) return undefined;

  const rest: string[] = [];
  // Name every move between the last fact shown and the next, so no move in
  // the line is skipped silently.
  // The first move is always named, by its fact or by the sentence that
  // stands in for one.
  let shownPly = 0;
  const lead = ({ ply }: { readonly ply: number }) => {
    const between = moves.slice(shownPly + 1, ply);
    shownPly = ply;
    const [only] = between;
    if (between.length === 1 && only)
      return only.color === viewer
        ? `After you reply ${only.san}, `
        : `After ${SIDE[only.color]} replies ${only.san}, `;
    // A longer stretch is left to the board, which plays every move. The
    // moves into a forced mate are the lesson, so they are all named.
    if (between.length > NAMED_MOVES && !mated) return LATER;
    return between.length
      ? `After ${between.map(({ san }) => san).join(" ")}, `
      : "";
  };
  if (bridge) rest.push(lead(bridge) + lower(bridge.text));
  if (payoff)
    rest.push(
      bridge?.ply === payoff.ply
        ? payoff.text
        : lead(payoff) + lower(payoff.text),
    );
  // Moves read past the usual end, until the material settles, and any
  // unshown capture, such as a take-back, are named before the count they
  // set.
  const tail = moves.slice(shownPly + 1);
  const led =
    moves.length > plies || tail.some(({ captured }) => captured !== undefined)
      ? lead({ ply: moves.length })
      : "";
  // A promotion left to the board is named, since it changes the count.
  const promoted = tail.findLast(({ promotion }) => promotion !== undefined);
  const settling =
    led === LATER && promoted?.promotion
      ? `${LATER}${promoted.san} makes a new ${NAME[promoted.promotion]}. `
      : led;
  const owed = takeBack
    ? `${settling && !settling.endsWith(". ") ? "once" : "Once"} ${SIDE[takeBack.by]} takes back on ${takeBack.square}, `
    : "";
  if (!mated)
    rest.push(settling + owed + materialText(SIDE[us], gain, balance));
  return { firstMove, setup, bridge, rest };
}

// A capture answered at once by taking back a piece worth as much on the
// same square is a trade, not a payoff.
function traded(moves: readonly Move[], ply: number): boolean {
  const move = moves[ply];
  const next = moves[ply + 1];
  return (
    move?.captured !== undefined &&
    next?.to === move.to &&
    next.captured !== undefined &&
    PIECE_VALUE[next.captured] >= PIECE_VALUE[move.captured]
  );
}

function explainWithin(
  input: MissedLineInput,
  learnerMoves: number,
): MissedLineExplanation | undefined {
  const reading = readLine(input.fen, input.line, learnerMoves);
  if (!reading) return undefined;
  const { firstMove, setup, rest } = reading;
  // A discovered attack is about another piece, so the move's own capture
  // or check is named first: a check is why the attacked piece cannot be
  // saved.
  const taking =
    setup?.kind !== "discovered"
      ? undefined
      : firstMove.captured
        ? `${firstMove.san} takes ${pieceOf(opponent(firstMove.color), firstMove.captured, undefined)} on ${firstMove.to}.`
        : firstMove.san.endsWith("+")
          ? `${firstMove.san} gives check.`
          : undefined;
  const parts = [
    ...(taking ? [taking] : []),
    setup?.text ?? `${firstMove.san} was the stronger move.`,
    ...rest,
  ];
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

// What the player's move allowed: the opponent's best reply and what it wins,
// read from the opponent's side with the player's pieces named "your".
// `line` starts with the player's move, followed by Stockfish's line for the
// opponent. Says nothing unless the reply is a tactic, mates, or takes a piece
// that had no defender or is worth much more than the piece taking it: a
// plain recapture is not the lesson.
export function explainAllowedLine(input: {
  readonly fen: string;
  readonly line: readonly string[];
}): MissedLineExplanation | undefined {
  const [playedUci, ...reply] = input.line;
  if (!playedUci) return undefined;
  let played: Move;
  let after: Chess;
  try {
    after = new Chess(input.fen);
    played = after.move(playedUci);
  } catch {
    return undefined;
  }
  const viewer = played.color;
  // Counted from before the player's move, so a piece it took first is not
  // counted as the opponent's gain.
  const before = new Chess(input.fen);
  const reading = READINGS.reduce<LineReading | undefined>(
    (found, learnerMoves) =>
      found ?? allowedReading(after.fen(), reply, learnerMoves, viewer, before),
    undefined,
  );
  if (!reading) return undefined;
  const { firstMove, rest } = reading;
  // A reply with no fact of its own, such as a pawn push that sets up a
  // trap, is named before the tactic that follows.
  if (!reading.setup)
    return {
      text: [
        `After ${played.san}, ${SIDE[firstMove.color]} plays ${firstMove.san}.`,
        ...rest,
      ].join(" "),
    };
  const setup =
    reading.setup.kind === "capture" && winsExchange(firstMove)
      ? {
          ...reading.setup,
          text: reading.setup.text.replace(
            /\.$/,
            ` with a ${PIECE_NAME[firstMove.piece]}.`,
          ),
        }
      : reading.setup;
  return { text: [replySentence(played, firstMove, setup), ...rest].join(" ") };
}

// A defended piece taken by one worth at least two points less: the
// exchange itself is the lesson.
function winsExchange(move: Move): boolean {
  return (
    move.captured !== undefined &&
    PIECE_VALUE[move.captured] - PIECE_VALUE[move.piece] >= 2
  );
}

// Facts about a move start with its SAN and a verb, so they join the reply
// as a participle: "White plays Qxb7, attacking your rook ...".
const PARTICIPLE: Readonly<Record<string, string>> = {
  takes: "taking",
  attacks: "attacking",
  lines: "lining",
  gives: "giving",
};

function replySentence(played: Move, reply: Move, setup: Fact): string {
  const opening = `After ${played.san}, ${SIDE[reply.color]} plays ${reply.san}`;
  if (setup.text.startsWith(`${reply.san} `)) {
    const rest = setup.text.slice(reply.san.length + 1);
    const [verb = "", ...words] = rest.split(" ");
    const participle = PARTICIPLE[verb];
    return participle
      ? `${opening}, ${[participle, ...words].join(" ")}`
      : `${opening}, which ${rest}`;
  }
  // A discovered attack is about another piece, so the reply's own capture
  // is named first.
  const taking = reply.captured
    ? `, taking ${pieceOf(opponent(reply.color), reply.captured, played.color)} on ${reply.to}`
    : "";
  return `${opening}${taking}. ${setup.text}`;
}

const TELLING = new Set<FactKind>([...TACTIC, "mate", "capture-free"]);

function allowedReading(
  fen: string,
  line: readonly string[],
  learnerMoves: number,
  viewer: Color,
  countFrom: Chess,
): LineReading | undefined {
  const reading = readLine(fen, line, learnerMoves, viewer, countFrom);
  if (!reading) return undefined;
  const telling =
    (reading.setup !== undefined && TELLING.has(reading.setup.kind)) ||
    (reading.setup?.kind === "capture" && winsExchange(reading.firstMove)) ||
    reading.bridge !== undefined;
  return telling ? reading : undefined;
}
