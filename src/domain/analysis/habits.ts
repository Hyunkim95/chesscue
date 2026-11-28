import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

import { PIECE_VALUE, opponent, staticExchange } from "./board-relations";

// Cross-game habits (PRD §5.5, "Import by username"). Today there is one: a
// piece of the player's was already attacked and could be won, the player
// moved something else, and the opponent took it. On 391,000 Lichess
// player-games rated 1000-2000 it cost 0.21 of a point per game it appeared
// in, the most of the habits measured (research_notes/habits/). Choices of
// style cost nothing there and are not habits. Pure: chess.js only.

export const HABITS_VERSION = "habits/1";

export type HabitId = "ignored-threat";

// One time it happened, from the position the player faced.
export interface HabitMoment {
  // The player's move, counted from the start of the score (0 = first move).
  readonly ply: number;
  // The position before the player's move, the player to move.
  readonly fen: string;
  readonly played: string;
  // The attacked piece the opponent then took.
  readonly square: Square;
  readonly piece: PieceSymbol;
  readonly attackers: readonly Square[];
  readonly takenWith: string;
}

// The opening, where pieces are traded back and forth, is left out.
const FIRST_MOVE = 6;

// Every time `side` left an attacked piece that could be won where it was and
// the opponent took it next move. Undefined when the score is not legal.
// A player in check had to answer the check, and a move that took something
// worth as much as the piece left behind was a fair trade: neither counts.
export function ignoredThreats(
  sans: readonly string[],
  side: Color,
  startFen?: string,
): readonly HabitMoment[] | undefined {
  let board: Chess;
  try {
    board = startFen === undefined ? new Chess() : new Chess(startFen);
  } catch {
    return undefined;
  }
  const moments: HabitMoment[] = [];
  for (const [ply, san] of sans.entries()) {
    const before = board.fen();
    const mover = board.turn();
    const checked = board.inCheck();
    const moveNumber = board.moveNumber();
    let move;
    try {
      move = board.move(san);
    } catch {
      return undefined;
    }
    const reply = sans[ply + 1];
    if (mover !== side || checked || moveNumber < FIRST_MOVE || !reply)
      continue;
    let taken;
    try {
      taken = new Chess(board.fen()).move(reply);
    } catch {
      return undefined;
    }
    const square = taken.to;
    const lost = taken.captured;
    if (!lost || lost === "p" || move.from === square || move.to === square)
      continue;
    const them = opponent(side);
    const faced = new Chess(before);
    if (
      staticExchange(faced, square, them) < 2 ||
      staticExchange(board, square, them) < 2
    )
      continue;
    if (move.captured && PIECE_VALUE[move.captured] >= PIECE_VALUE[lost])
      continue;
    moments.push({
      ply,
      fen: before,
      played: move.san,
      square,
      piece: lost,
      attackers: faced.attackers(square, them),
      takenWith: taken.san,
    });
  }
  return moments;
}

export interface HabitGame {
  readonly id: string;
  readonly sans: readonly string[];
  readonly side: Color;
  readonly startFen?: string;
}

// A habit needs enough games to mean something, and must show up in a real
// share of them.
export const HABIT_MIN_GAMES = 10;
export const HABIT_MIN_SHARE = 0.25;
export const HABIT_MIN_COUNT = 3;
const EXAMPLES = 3;

export type CostliestHabit =
  | {
      readonly status: "too-few-games";
      readonly analysed: number;
      readonly needed: number;
    }
  | { readonly status: "none"; readonly analysed: number }
  | {
      readonly status: "habit";
      readonly id: HabitId;
      readonly analysed: number;
      // Games it happened in at least once.
      readonly games: number;
      // Up to three moments, one per game, from the newest games first.
      readonly examples: readonly {
        readonly game: string;
        readonly moment: HabitMoment;
      }[];
    };

// The player's costliest habit across their games, newest game first. Games
// whose score is not legal are left out of the count.
export function costliestHabit(games: readonly HabitGame[]): CostliestHabit {
  const read = games.flatMap((game) => {
    const moments = ignoredThreats(game.sans, game.side, game.startFen);
    return moments ? [{ game: game.id, moments }] : [];
  });
  const analysed = read.length;
  if (analysed < HABIT_MIN_GAMES)
    return { status: "too-few-games", analysed, needed: HABIT_MIN_GAMES };
  const hit = read.filter(({ moments }) => moments.length > 0);
  if (hit.length < HABIT_MIN_COUNT || hit.length / analysed < HABIT_MIN_SHARE)
    return { status: "none", analysed };
  return {
    status: "habit",
    id: "ignored-threat",
    analysed,
    games: hit.length,
    examples: hit.slice(0, EXAMPLES).flatMap(({ game, moments }) => {
      const [moment] = moments;
      return moment ? [{ game, moment }] : [];
    }),
  };
}
