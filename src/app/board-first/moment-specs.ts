import { Chess } from "chess.js";

import type {
  LearningMoment,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import {
  observedGameMoves,
  type ObservedMove,
} from "../../domain/curriculum/game-drill";
import type { GameRecord } from "../../domain/game/types";
import type { FollowUpPuzzle } from "../../domain/curriculum/follow-up-puzzles";
import { unitForDrill } from "../../domain/curriculum/recommend-unit";
import {
  momentGoal,
  puzzleGoal,
  PLAN_TOLERANCE_CP,
  type MomentGoal,
} from "../../domain/session/moment-goal";
import { dangerMoment } from "../../domain/session/spot-danger";
import type { MomentSpec } from "../../features/moment/MomentScreen";

export interface UnitCopy {
  readonly title: string;
  readonly goal: string;
}

function goalFields(goal: MomentGoal) {
  return goal.kind === "plan"
    ? { goal, toleranceCp: PLAN_TOLERANCE_CP }
    : { goal };
}

const WEEKDAY = new Intl.DateTimeFormat("en", { weekday: "long" });

function sanFor(fen: string, uci: string) {
  try {
    const move = new Chess(fen).move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
    });
    return { uci: move.lan, san: move.san };
  } catch {
    return undefined;
  }
}

function opponentOf(observed: ObservedMove): string {
  const { game } = observed;
  if (game.origin.type === "tutor") return "Stockfish";
  const tag = game.playerColor === "white" ? "Black" : "White";
  const name = new RegExp(`\\[${tag} "([^"]+)"\\]`).exec(game.pgn)?.[1];
  return name && name !== "?" ? name : "your opponent";
}

export function gameMomentId(observed: ObservedMove): string {
  return `${observed.game.id}:${String(observed.ply)}`;
}

// Prefer a turning point, then the last checked decision for a clean game.
export function pickGameReviewMoment(
  game: GameRecord,
  analysis: {
    readonly facts: readonly MoveAnalysisFact[];
    readonly moments: readonly LearningMoment[];
  },
): ObservedMove | undefined {
  const moves = observedGameMoves(game, analysis);
  const missed = moves.filter(({ outcome }) => outcome === "retry");
  for (const moment of analysis.moments) {
    const observed = missed.find(({ ply }) => ply === moment.ply);
    if (observed) return observed;
  }
  return (
    missed.toSorted((a, b) => b.impactCp - a.impactCp || a.ply - b.ply)[0] ??
    moves.toSorted((a, b) => b.ply - a.ply)[0]
  );
}

// How much of the game after the player's move "what happened" replays.
const GAME_LINE_PLIES = 6;

// A position from the player's own game, with Stockfish's verified line.
export function momentFromGame(
  observed: ObservedMove,
  units: ReadonlyMap<string, UnitCopy>,
): MomentSpec | undefined {
  const { exercise } = observed.drill;
  const line = exercise.verification.principalVariation;
  const bestUci = line[0];
  if (bestUci === undefined) return undefined;
  const candidates = exercise.verification.candidates;
  const best = candidates.find(({ uci }) => uci === bestUci);
  if (!best) return undefined;
  const unitId = unitForDrill(observed.drill);
  const goal = momentGoal(exercise.fen, line, units.get(unitId)?.goal);
  // "What if …?" must name a move that would not count as a find.
  const tolerance =
    goal.kind === "plan"
      ? PLAN_TOLERANCE_CP
      : exercise.verification.toleranceCp;
  const nonSolution = candidates
    .filter(
      ({ uci, evaluationCp }) =>
        uci !== bestUci && best.evaluationCp - evaluationCp > tolerance,
    )
    .toSorted((a, b) => b.evaluationCp - a.evaluationCp)[0];
  const { moves } = observed.game;
  const played = moves.find(({ ply }) => ply === observed.ply);
  const previous = moves.find(({ ply }) => ply === observed.ply - 1);
  const completed = observed.game.completedAt;
  // Code chooses the format from the moment's facts; there is no mode menu.
  const danger = dangerMoment({
    fen: exercise.fen,
    solutionLine: line,
    lastMove: previous ? { uci: previous.uci, san: previous.san } : undefined,
    gameLine: moves
      .filter(
        ({ ply }) =>
          ply >= observed.ply && ply < observed.ply + GAME_LINE_PLIES,
      )
      .toSorted((a, b) => a.ply - b.ply)
      .map(({ uci }) => uci),
  });
  return {
    id: gameMomentId(observed),
    fen: exercise.fen,
    bestUci,
    bestCp: best.evaluationCp,
    solutionLine: line,
    sourceLabel: `Your game vs ${opponentOf(observed)}${completed ? ` · ${WEEKDAY.format(new Date(completed))}` : ""}`,
    playedInGame: played ? { uci: played.uci, san: played.san } : undefined,
    bestNonSolution: nonSolution
      ? sanFor(exercise.fen, nonSolution.uci)
      : undefined,
    ideaName: units.get(unitId)?.title,
    ...goalFields(goal),
    unitId,
    source: { kind: "game", gameId: observed.game.id, ply: observed.ply },
    ...(danger ? { danger } : {}),
    ...(previous
      ? {
          previousMove: {
            fen:
              moves.find(({ ply }) => ply === observed.ply - 2)?.fenAfter ??
              observed.game.initialFen,
            uci: previous.uci,
          },
        }
      : {}),
  };
}

// The installed solution is already checked. A live score is only needed
// when the player tries or previews a different move.
export function momentFromPuzzle(
  puzzle: FollowUpPuzzle,
  units: ReadonlyMap<string, UnitCopy>,
  sourceLabel: string,
): MomentSpec | undefined {
  const bestUci = puzzle.solution[0];
  if (bestUci === undefined) return undefined;
  return {
    id: `puzzle:${puzzle.id}`,
    fen: puzzle.fen,
    bestUci,
    bestCp: undefined,
    solutionLine: puzzle.solution,
    sourceLabel,
    ideaName: units.get(puzzle.unitId)?.title,
    ...goalFields(puzzleGoal(puzzle.fen, puzzle.solution)),
    unitId: puzzle.unitId,
    source: { kind: "puzzle", puzzleId: puzzle.id },
  };
}
