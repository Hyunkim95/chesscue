import { Chess } from "chess.js";

import type { ObservedMove } from "../../domain/curriculum/game-drill";
import type { FollowUpPuzzle } from "../../domain/curriculum/follow-up-puzzles";
import { unitForDrill } from "../../domain/curriculum/recommend-unit";
import {
  momentGoal,
  puzzleGoal,
  PLAN_TOLERANCE_CP,
  type MomentGoal,
} from "../../domain/session/moment-goal";
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
  const played = observed.game.moves.find(({ ply }) => ply === observed.ply);
  const completed = observed.game.completedAt;
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
  };
}

// A checked puzzle like the player's misses. Its evaluation comes from a
// search when the moment opens.
export function momentFromPuzzle(
  puzzle: FollowUpPuzzle,
  bestCp: number,
  units: ReadonlyMap<string, UnitCopy>,
  sourceLabel: string,
): MomentSpec | undefined {
  const bestUci = puzzle.solution[0];
  if (bestUci === undefined) return undefined;
  return {
    id: `puzzle:${puzzle.id}`,
    fen: puzzle.fen,
    bestUci,
    bestCp,
    solutionLine: puzzle.solution,
    sourceLabel,
    ideaName: units.get(puzzle.unitId)?.title,
    ...goalFields(puzzleGoal(puzzle.fen, puzzle.solution)),
    unitId: puzzle.unitId,
    source: { kind: "puzzle", puzzleId: puzzle.id },
  };
}
