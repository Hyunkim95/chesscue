import { Chess, SQUARES, type Move, type Square } from "chess.js";

import type { BoardArrow } from "../analysis/board-move-cues";
import {
  PIECE_NAME,
  fileOf,
  opponent,
  rankOf,
  staticExchange,
} from "../analysis/board-relations";
import {
  DANGER_FACTS_VERSION,
  dangerFacts,
  type DangerFact,
} from "../analysis/danger-facts";
import { TACTIC_LINE_VERSION, tacticKind } from "../analysis/explain-miss";
import {
  lineStoryboard,
  payoffFrame,
  type StoryFrame,
} from "../analysis/line-storyboard";
import { hasClearBestMove } from "../session/moment-goal";
import { isSeriousDanger, stillThere } from "../session/spot-danger";
import type { ObservedMove } from "./game-drill";

// What the player did well in a real game (owner decision, 28 November 2026):
// a tactic they played, a threat they dealt with, or the only move they found.
// Every good move is a move Stockfish agrees with (an observed "matched" move,
// within the review tolerance of its best), so it is never flattery. The
// reading uses the settled tactic lines and the checked danger facts.
export const GOOD_MOVES_VERSION = `good-moves/1 (${TACTIC_LINE_VERSION}, ${DANGER_FACTS_VERSION})`;

export type GoodMoveKind = "tactic" | "threat" | "only-move";

export interface GoodMove {
  readonly gameId: string;
  readonly ply: number;
  readonly kind: GoodMoveKind;
  // The move as the player wrote it, for example "Nxe6".
  readonly san: string;
  // "Move 14", the player's move number.
  readonly moveLabel: string;
  // The position before the move, the move and its line, then one closing
  // frame that says why it was good and draws it.
  readonly frames: readonly StoryFrame[];
}

const SIDE = { w: "White", b: "Black" } as const;

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

// How the game stands for the player, from Stockfish's score.
type Standing = "winning" | "better" | "level" | "worse" | "losing";
function standing(cp: number): Standing {
  if (cp >= 300) return "winning";
  if (cp >= 100) return "better";
  if (cp > -100) return "level";
  if (cp > -300) return "worse";
  return "losing";
}

const HOLDS: Record<Standing, string> = {
  winning: "keeps your advantage",
  better: "keeps your advantage",
  level: "keeps the game level",
  worse: "keeps you in the game",
  losing: "keeps you in the game",
};

// The only move: Stockfish's best beats the next checked move by the plan
// tolerance, and the next move would change how the game stands. Undefined
// when the player's move is not that move.
function onlyMove(observed: ObservedMove, playedUci: string) {
  const { candidates, principalVariation } =
    observed.drill.exercise.verification;
  const [best, second] = candidates.toSorted(
    (a, b) => b.evaluationCp - a.evaluationCp,
  );
  if (
    best === undefined ||
    second === undefined ||
    best.uci !== playedUci ||
    principalVariation[0] !== playedUci ||
    !hasClearBestMove(candidates) ||
    standing(best.evaluationCp) === standing(second.evaluationCp)
  )
    return undefined;
  return { holds: HOLDS[standing(best.evaluationCp)] };
}

// Whether `square` lies strictly between `from` and `to` on one line.
function between(from: Square, to: Square, square: Square): boolean {
  const df = fileOf(to) - fileOf(from),
    dr = rankOf(to) - rankOf(from);
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return false;
  const steps = Math.max(Math.abs(df), Math.abs(dr));
  for (let step = 1; step < steps; step++) {
    const file = fileOf(from) + Math.sign(df) * step,
      rank = rankOf(from) + Math.sign(dr) * step;
    if (fileOf(square) === file && rankOf(square) === rank) return true;
  }
  return false;
}

const asSquare = (name: string | undefined): Square | undefined =>
  SQUARES.find((square) => square === name);

// The square a mate threat mates on, from its stable id ("mate-threat:h5f7").
function mateSquare(fact: DangerFact): Square | undefined {
  return asSquare(/^mate-threat:[a-h][1-8]([a-h][1-8])$/.exec(fact.id)?.[1]);
}

// The material a danger must win to count, in pawns, as in Spot the danger.
const MIN_GAIN = 2;

// The danger the move removed: the most serious one before it that is gone
// after it. A piece that moves away, takes or blocks must not be left to be
// won where it lands, so a sacrifice never reads as a rescue.
function threatRemoved(
  fen: string,
  move: Move,
): { readonly fact: DangerFact } | undefined {
  const after = new Chess(move.after);
  if (staticExchange(after, move.to, opponent(move.color)) >= MIN_GAIN)
    return undefined;
  const facts = dangerFacts(fen)?.filter(isSeriousDanger) ?? [];
  const fact = facts.find((danger) => !stillThere(after, danger, move.color));
  return fact ? { fact } : undefined;
}

// How the move dealt with the danger, in one sentence.
function threatCaption(
  fact: DangerFact,
  move: Move,
  only: ReturnType<typeof onlyMove>,
): string {
  if (fact.kind === "mate-threat")
    return only
      ? `${move.san} was the only move that stops mate.`
      : `${move.san} stops the mate threat.`;
  const piece = PIECE_NAME[fact.piece];
  if (only) return `${move.san} was the only move that keeps your ${piece}.`;
  if (move.from === fact.target)
    return `${move.san} moves your ${piece} out of danger.`;
  if (fact.attackers.includes(move.to))
    return `${move.san} takes the piece that was after your ${piece}.`;
  if (fact.attackers.some((from) => between(from, fact.target, move.to)))
    return `${move.san} blocks the threat to your ${piece}.`;
  return `${move.san} defends your ${piece}.`;
}

function closing(
  last: StoryFrame,
  caption: string,
  outlines: StoryFrame["outlines"],
  arrows: readonly BoardArrow[] = [],
): StoryFrame {
  // Not a move: no last-move highlight, so the outlines read clearly.
  return { ...last, moveUci: "", arrows, outlines, control: [], caption };
}

// The position the player faced, with the danger drawn when there was one.
function opening(
  fen: string,
  lastMoveUci: string,
  moveNumber: number,
  danger: DangerFact | undefined,
): StoryFrame {
  const turn = new Chess(fen).turn();
  const base = {
    fen,
    moveUci: lastMoveUci,
    by: "rook" as const,
    control: [],
  };
  if (!danger)
    return {
      ...base,
      arrows: [],
      outlines: [],
      caption: `Move ${String(moveNumber)}, ${SIDE[turn]} to move. Watch what you played.`,
    };
  const to =
    danger.kind === "mate-threat"
      ? (mateSquare(danger) ?? danger.target)
      : danger.target;
  return {
    ...base,
    arrows: danger.attackers.map((from) => ({ from, to, kind: "threat" })),
    outlines: [{ square: danger.target, tone: "coral" }],
    caption: danger.text,
  };
}

// The good move at an observed position, or undefined. A plain recapture
// that completes a trade is not counted, whatever it gains, and neither is a
// move out of check.
export function goodMove(observed: ObservedMove): GoodMove | undefined {
  if (observed.outcome !== "matched") return undefined;
  const { game, ply, playedLine } = observed;
  const fen = observed.drill.exercise.fen;
  const played = game.moves.find((move) => move.ply === ply);
  const previous = game.moves.find((move) => move.ply === ply - 1);
  if (!played) return undefined;
  const board = new Chess(fen);
  if (board.inCheck()) return undefined;
  const moveNumber = board.moveNumber();
  const move = play(board, played.uci);
  if (move?.san !== played.san) return undefined;
  if (
    previous?.san.includes("x") &&
    previous.uci.slice(2, 4) === move.to &&
    !move.san.endsWith("#")
  )
    return undefined;
  const line = playedLine[0] === move.lan ? playedLine : [move.lan];
  const base = {
    gameId: game.id,
    ply,
    san: move.san,
    moveLabel: `Move ${String(moveNumber)}`,
  };
  const lastMoveUci = previous?.uci ?? "";

  // A tactic: a forcing move (a capture, a check or a new attack) whose line
  // mates, or wins material that is still won once its exchanges settle and
  // the storyboard shows it. A quiet move is not credited with a later tactic.
  const tactic = tacticKind(fen, line);
  const frames = tactic === undefined ? [] : lineStoryboard(fen, line);
  const forcing =
    move.captured !== undefined ||
    /[+#]$/.test(move.san) ||
    frames[0]?.arrows.some(({ kind }) => kind === "attack") === true;
  if (tactic !== undefined && forcing) {
    const last = frames.at(-1);
    if (last && tactic === "mate") {
      const end = new Chess(last.fen);
      const kings = end.isCheckmate()
        ? end.findPiece({ type: "k", color: end.turn() })
        : [];
      return {
        ...base,
        kind: "tactic",
        frames: [
          opening(fen, lastMoveUci, moveNumber, undefined),
          ...frames,
          closing(
            last,
            move.san.endsWith("#")
              ? "Mate in one, and you found it."
              : `${move.san} starts a forced mate.`,
            kings.map((square) => ({ square, tone: "coral" as const })),
          ),
        ],
      };
    }
    const payoff = payoffFrame(fen, frames);
    if (payoff?.caption.startsWith("You've won ")) {
      return {
        ...base,
        kind: "tactic",
        frames: [
          opening(fen, lastMoveUci, moveNumber, undefined),
          ...frames,
          {
            ...payoff,
            caption: `${move.san} wins ${payoff.caption.slice("You've won ".length)}`,
          },
        ],
      };
    }
  }

  const only = onlyMove(observed, move.lan);
  const threat = threatRemoved(fen, move);
  const [moved] = lineStoryboard(fen, [move.lan]);
  if (!moved || (!threat && !only)) return undefined;
  if (threat) {
    const { fact } = threat;
    const kept =
      fact.kind === "mate-threat"
        ? new Chess(move.after).findPiece({ type: "k", color: move.color })
        : [move.from === fact.target ? move.to : fact.target];
    return {
      ...base,
      kind: "threat",
      frames: [
        opening(fen, lastMoveUci, moveNumber, fact),
        moved,
        closing(
          moved,
          threatCaption(fact, move, only),
          kept.map((square) => ({ square, tone: "jade" as const })),
          [{ from: move.from, to: move.to, kind: "preview" }],
        ),
      ],
    };
  }
  if (!only) return undefined;
  return {
    ...base,
    kind: "only-move",
    frames: [
      opening(fen, lastMoveUci, moveNumber, undefined),
      moved,
      closing(
        moved,
        `${move.san} was the only move that ${only.holds}.`,
        [{ square: move.to, tone: "jade" }],
        [{ from: move.from, to: move.to, kind: "preview" }],
      ),
    ],
  };
}

// Reading a position replays lines and scans for threats, so each observed
// move is read once.
const read = new WeakMap<ObservedMove, GoodMove | null>();
export function readGoodMove(observed: ObservedMove): GoodMove | undefined {
  const known = read.get(observed);
  if (known !== undefined) return known ?? undefined;
  const found = goodMove(observed);
  read.set(observed, found ?? null);
  return found;
}

// The player's good moves in one game, in the order they were played.
export function goodMovesInGame(
  moves: readonly ObservedMove[],
): readonly GoodMove[] {
  return moves
    .flatMap((observed) => readGoodMove(observed) ?? [])
    .toSorted((a, b) => a.ply - b.ply);
}
