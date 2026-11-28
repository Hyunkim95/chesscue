import {
  Chess,
  SQUARES,
  type Color,
  type PieceSymbol,
  type Square,
} from "chess.js";

import {
  PIECE_NAME,
  PIECE_VALUE,
  opponent,
  staticExchange,
} from "../analysis/board-relations";
import { dangerFacts, type DangerFact } from "../analysis/danger-facts";
import { explainAllowedLine, tacticKind } from "../analysis/explain-miss";
import type { SanMove } from "./chips";

// "Spot the danger" (PRD §5.8, approved 28 November 2026). When the player's
// own game move left a piece to be taken or allowed a mate, the moment opens
// on the position they faced and asks whether something of theirs is in
// trouble. Spotting it is feedback only: the find-a-safe-move loop that
// follows is the only evidence. Everything here is chess.js replay.

export interface DangerMoment {
  // "White just played Nxd4. Is something of yours in trouble?"
  readonly question: string;
  // The opponent's move that led to the position, the only move marked.
  readonly lastMoveUci: string;
  // Every checked danger in the position, most serious first.
  readonly facts: readonly DangerFact[];
  // The player's game move and what followed in the game.
  readonly gameLine: readonly string[];
  // What happened in the game, from the allowed-line facts.
  readonly gameCaption: string;
}

// The material a danger must win to be the lesson, in pawns, as in the
// missed-line facts' "wins material".
const MIN_GAIN = 2;
const SIDE = { w: "White", b: "Black" } as const;

// A danger worth a lesson: a mate threat, or a piece the opponent wins at
// least two points from.
export const isSeriousDanger = (fact: DangerFact) =>
  fact.kind === "mate-threat" ||
  (fact.kind === "wins-material" && fact.gain >= MIN_GAIN);

// A tap on the target of one of these spots the danger.
export const isDanger = (fact: DangerFact) =>
  fact.kind === "mate-threat" || fact.kind === "wins-material";

const asSquare = (name: string | undefined): Square | undefined =>
  SQUARES.find((square) => square === name);

const opponentName = (fen: string) =>
  SIDE[new Chess(fen).turn() === "w" ? "b" : "w"];

function play(fen: string, uci: string): Chess | undefined {
  try {
    const board = new Chess(fen);
    board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    });
    return board;
  } catch {
    return undefined;
  }
}

const sanAt = (fen: string, uci: string) => play(fen, uci)?.history().at(-1);

// Whether the danger is still there after the player's move.
export function stillThere(
  after: Chess,
  fact: DangerFact,
  player: Color,
): boolean {
  if (fact.kind === "mate-threat")
    return after.moves().some((san) => san.endsWith("#"));
  const piece = after.get(fact.target);
  return (
    piece?.color === player &&
    piece.type === fact.piece &&
    staticExchange(after, fact.target, opponent(player)) >= MIN_GAIN
  );
}

function gameCaption(
  fen: string,
  gameLine: readonly string[],
  player: Color,
): string {
  const allowed = explainAllowedLine({ fen, line: gameLine });
  if (allowed) {
    const first = allowed.text.split(/(?<=\.) /)[0] ?? allowed.text;
    return `In your game, ${first.charAt(0).toLowerCase()}${first.slice(1)}`;
  }
  const [played, reply] = gameLine;
  const playedSan = played === undefined ? undefined : sanAt(fen, played);
  const after = played === undefined ? undefined : play(fen, played);
  const replySan =
    after && reply !== undefined ? sanAt(after.fen(), reply) : undefined;
  if (!playedSan) return "";
  return replySan
    ? `In your game you played ${playedSan}, and ${SIDE[opponent(player)]} answered ${replySan}.`
    : `In your game you played ${playedSan}.`;
}

// The format applies when the position already held a serious danger, the
// better line defends rather than winning something of the player's own, and
// the player's game move left the danger in place.
export function dangerMoment(input: {
  readonly fen: string;
  readonly solutionLine: readonly string[];
  readonly lastMove: SanMove | undefined;
  readonly gameLine: readonly string[];
}): DangerMoment | undefined {
  const { fen, solutionLine, lastMove, gameLine } = input;
  const [played] = gameLine;
  if (!lastMove || played === undefined || played === solutionLine[0])
    return undefined;
  if (tacticKind(fen, solutionLine) !== undefined) return undefined;
  const facts = dangerFacts(fen);
  const after = play(fen, played);
  if (!facts || !after) return undefined;
  const board = new Chess(fen);
  // In check, the lesson is getting out of it.
  if (board.inCheck()) return undefined;
  const player = board.turn();
  if (
    !facts.some(
      (fact) => isSeriousDanger(fact) && stillThere(after, fact, player),
    )
  )
    return undefined;
  return {
    question: `${SIDE[opponent(player)]} just played ${lastMove.san}. Is something of yours in trouble?`,
    lastMoveUci: lastMove.uci,
    facts,
    gameLine,
    gameCaption: gameCaption(fen, gameLine, player),
  };
}

// A tap or a description of a verified threat can spot it. "finding" hands
// over to the safe-move loop.
export type SpotState =
  | { readonly kind: "looking" }
  | { readonly kind: "nudged"; readonly cause: NudgeCause }
  | { readonly kind: "spotted"; readonly factId: string }
  | { readonly kind: "finding" };

export type NudgeCause =
  // A piece that is attacked but safe to leave.
  | { readonly kind: "safe-attacked"; readonly factId: string }
  // A piece of the player's that nothing attacks.
  | { readonly kind: "untouched"; readonly square: Square }
  // An empty square or one of the opponent's pieces.
  | { readonly kind: "not-yours" }
  // A typed answer that matched none of the facts.
  | { readonly kind: "none" };

export type SpotEvent =
  | { readonly kind: "tap"; readonly square: Square }
  // The fact a model matched a typed answer to, or undefined for none.
  | { readonly kind: "read"; readonly factId: string | undefined }
  | { readonly kind: "find" };

export const startSpot: SpotState = { kind: "looking" };

// The player is still looking for the danger: taps and typed answers apply.
export const spotting = (state: SpotState) =>
  state.kind === "looking" || state.kind === "nudged";

function factFor(moment: DangerMoment, id: string | undefined) {
  return moment.facts.find((fact) => fact.id === id);
}

// `fen` is the position the player faces. Events that do not apply to the
// current state leave it unchanged.
export function advanceSpot(
  moment: DangerMoment,
  fen: string,
  state: SpotState,
  event: SpotEvent,
): SpotState {
  if (event.kind === "find")
    return state.kind === "spotted" ? { kind: "finding" } : state;
  if (!spotting(state)) return state;
  if (event.kind === "read") {
    const fact = factFor(moment, event.factId);
    if (!fact) return { kind: "nudged", cause: { kind: "none" } };
    return isDanger(fact)
      ? { kind: "spotted", factId: fact.id }
      : { kind: "nudged", cause: { kind: "safe-attacked", factId: fact.id } };
  }
  const tapped = moment.facts.filter(({ target }) => target === event.square);
  const danger = tapped.find(isDanger);
  if (danger) return { kind: "spotted", factId: danger.id };
  const [safe] = tapped;
  if (safe)
    return {
      kind: "nudged",
      cause: { kind: "safe-attacked", factId: safe.id },
    };
  const board = new Chess(fen);
  return board.get(event.square)?.color === board.turn()
    ? { kind: "nudged", cause: { kind: "untouched", square: event.square } }
    : { kind: "nudged", cause: { kind: "not-yours" } };
}

const OTHER_MOVES: Readonly<Record<PieceSymbol, string>> = {
  n: "jumps",
  b: "lines",
  r: "lines",
  q: "lines",
  p: "captures",
  k: "captures",
};

const pieceAt = (fen: string, square: Square) => new Chess(fen).get(square);

// The opponent's move from `from` to `to`, played as if it were their turn.
function threatMove(fen: string, from: Square, to: Square) {
  const fields = fen.split(" ");
  fields[1] = fields[1] === "w" ? "b" : "w";
  fields[3] = "-";
  try {
    return new Chess(fields.join(" ")).move({ from, to, promotion: "q" });
  } catch {
    return undefined;
  }
}

// A mate-threat fact's id names the mating move: "mate-threat:e8e1".
function mateMove(fact: DangerFact) {
  const [, from, to] =
    /^mate-threat:([a-h][1-8])([a-h][1-8])$/.exec(fact.id) ?? [];
  const fromSquare = asSquare(from);
  const toSquare = asSquare(to);
  return fromSquare && toSquare
    ? { from: fromSquare, to: toSquare }
    : undefined;
}

// What a spotted danger draws: arrows from its attackers to the target and to
// every other piece of the player's those attackers hit, and outlines on
// those targets. A mate threat draws the mating move and the king.
export function dangerMarks(
  moment: DangerMoment,
  factId: string,
): {
  readonly arrows: readonly { readonly from: Square; readonly to: Square }[];
  readonly targets: readonly Square[];
} {
  const fact = factFor(moment, factId);
  if (!fact) return { arrows: [], targets: [] };
  if (fact.kind === "mate-threat") {
    const mate = mateMove(fact);
    return { arrows: mate ? [mate] : [], targets: [fact.target] };
  }
  const related = moment.facts.filter(
    (other) =>
      other.kind !== "mate-threat" &&
      other.attackers.some((square) => fact.attackers.includes(square)),
  );
  return {
    arrows: related.flatMap(({ target, attackers }) =>
      attackers
        .filter((square) => fact.attackers.includes(square))
        .map((from) => ({ from, to: target })),
    ),
    targets: related.map(({ target }) => target),
  };
}

// What the danger wins, said through the opponent's capture.
function spottedCaption(fen: string, fact: DangerFact): string {
  const side = opponentName(fen);
  if (fact.kind === "mate-threat") {
    const mate = mateMove(fact);
    const move = mate ? threatMove(fen, mate.from, mate.to) : undefined;
    return move
      ? `Yes. ${side} threatens ${move.san}, checkmate.`
      : `Yes. ${side} threatens mate.`;
  }
  const [attacker] = fact.attackers
    .flatMap((square) => {
      const piece = pieceAt(fen, square);
      return piece ? [{ square, type: piece.type }] : [];
    })
    .toSorted((a, b) => PIECE_VALUE[a.type] - PIECE_VALUE[b.type]);
  const move = attacker
    ? threatMove(fen, attacker.square, fact.target)
    : undefined;
  if (!attacker || !move) return `Yes. ${fact.text}`;
  const value = PIECE_VALUE[fact.piece];
  const tail =
    fact.gain === value
      ? ", which has no defender"
      : fact.gain === value - PIECE_VALUE[attacker.type]
        ? ` for a ${PIECE_NAME[attacker.type]}`
        : "";
  return `Yes. ${side} threatens ${move.san}, winning your ${PIECE_NAME[fact.piece]}${tail}.`;
}

// What a fact says in "Gemini Nano understood · …".
export function dangerLabel(fact: DangerFact | undefined): string {
  if (!fact) return "no danger named";
  const piece = `${PIECE_NAME[fact.piece]} on ${fact.target}`;
  switch (fact.kind) {
    case "mate-threat":
      return "mate threat";
    case "wins-material":
      return `${piece} can be won`;
    case "attacked-but-safe":
      return `${piece} attacked`;
  }
}

const LOOKING = "Tap the piece you'd worry about. Or tell me what you see.";

// Rook's line for the state, written by code from the checked facts.
export function spotLine(
  moment: DangerMoment,
  fen: string,
  state: SpotState,
): string {
  switch (state.kind) {
    case "looking":
      return LOOKING;
    case "nudged":
      return nudge(moment, fen, state.cause);
    case "spotted": {
      const fact = factFor(moment, state.factId);
      return fact
        ? `${spottedCaption(fen, fact)} ${moment.gameCaption}`.trim()
        : moment.gameCaption;
    }
    case "finding":
      return `Play it on the board. I'll answer with ${opponentName(fen)}'s best reply.`;
  }
}

function nudge(moment: DangerMoment, fen: string, cause: NudgeCause): string {
  switch (cause.kind) {
    case "safe-attacked": {
      const fact = factFor(moment, cause.factId);
      if (!fact) return LOOKING;
      const shared = fact.attackers.find((square) =>
        moment.facts.some(
          (other) => isDanger(other) && other.attackers.includes(square),
        ),
      );
      const by = shared ? pieceAt(fen, shared) : undefined;
      const follow = by
        ? `Follow the ${PIECE_NAME[by.type]}'s other ${OTHER_MOVES[by.type]}.`
        : `Look at what else ${opponentName(fen)} attacks.`;
      return `True, your ${PIECE_NAME[fact.piece]} on ${fact.target} is attacked. Something bigger is too. ${follow}`;
    }
    case "untouched": {
      const piece = pieceAt(fen, cause.square);
      return `Your ${piece ? PIECE_NAME[piece.type] : "piece"} on ${cause.square} is safe for now. Something else is in trouble.`;
    }
    case "not-yours":
      return "Tap one of your own pieces: the one you'd worry about.";
    case "none":
      return `Not quite. Look at each of your pieces. Could ${opponentName(fen)} win one of them?`;
  }
}

// The Hint: the piece behind the most serious danger, never its target.
export function spotHint(
  moment: DangerMoment,
  fen: string,
): { readonly text: string; readonly square: Square } | undefined {
  const fact = moment.facts.find(isDanger);
  const [square] = fact?.attackers ?? [];
  const piece = square ? pieceAt(fen, square) : undefined;
  if (!square || !piece) return undefined;
  return {
    text: `Look at ${SIDE[piece.color]}'s ${PIECE_NAME[piece.type]} on ${square}. What could it do next?`,
    square,
  };
}
