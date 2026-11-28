import type { BoardArrow } from "../analysis/board-move-cues";
import { lineMaterialGain, tacticKind } from "../analysis/explain-miss";
import { planFocus, type PlanOutline } from "../analysis/plan-focus";

// What the player is working towards in a position, stated before they move
// (owner decision, 27 November 2026). A tactic says what it wins without
// naming the idea; a plan position names the pieces its best move is about
// and marks them on the board.
export type MomentGoal =
  | { readonly kind: "mate"; readonly prompt: string }
  | { readonly kind: "material"; readonly prompt: string }
  | { readonly kind: "best"; readonly prompt: string }
  | {
      readonly kind: "plan";
      readonly prompt: string;
      readonly arrows: readonly BoardArrow[];
      readonly outlines: readonly PlanOutline[];
    };

// Quiet positions usually have several good moves, so any move this close to
// Stockfish's best counts as a find. A plan position is only served when the
// best move beats the next one by at least this much.
export const PLAN_TOLERANCE_CP = 75;

function sentence(goal: string): string {
  const trimmed = goal.trim();
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

export function momentGoal(
  fen: string,
  line: readonly string[],
  unitGoal: string | undefined,
): MomentGoal {
  const kind = tacticKind(fen, line);
  if (kind === "mate") return { kind, prompt: "There's a forced mate here." };
  if (kind === "material")
    return { kind, prompt: "One move here wins material." };
  const best = line[0];
  const focus = best === undefined ? undefined : planFocus(fen, best);
  if (focus)
    return {
      kind: "plan",
      prompt: focus.prompt,
      arrows: focus.arrows,
      outlines: focus.outlines,
    };
  return {
    kind: "plan",
    prompt: unitGoal
      ? `Goal: ${sentence(unitGoal)}`
      : "Goal: find the move that does the most for your position.",
    arrows: [],
    outlines: [],
  };
}

// A library puzzle has one checked answer. Its goal says what the answer
// wins, never which idea it uses, so the idea is only named once it is found.
export function puzzleGoal(fen: string, line: readonly string[]): MomentGoal {
  const kind = tacticKind(fen, line);
  if (kind === "mate") return { kind, prompt: "There's a forced mate here." };
  if (kind === "material" || lineMaterialGain(fen, line) >= 1)
    return { kind: "material", prompt: "One move here wins material." };
  return { kind: "best", prompt: "Find the strongest move here." };
}

// Whether Stockfish's best move clearly beats the second best. With fewer
// than two checked candidates there is nothing to compare, so the answer is
// no: a plan position is served only when its answer is known to be one move.
export function hasClearBestMove(
  candidates: readonly { readonly evaluationCp: number }[],
): boolean {
  const [best, second] = candidates
    .map(({ evaluationCp }) => evaluationCp)
    .toSorted((a, b) => b - a);
  return (
    best !== undefined &&
    second !== undefined &&
    best - second >= PLAN_TOLERANCE_CP
  );
}

// Lichess's fit from an evaluation to the side's winning chances, from -1
// (lost) to 1 (won).
function winningChances(cp: number): number {
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

// The smallest change in winning chances Lichess calls an inaccuracy.
export const RESULT_CHANGE = 0.1;

// Whether the best move would have changed the game's likely result. In a
// position already won or lost the best move only wins or loses by a little
// more, so the line has no point to teach (owner decision, 28 November 2026).
export function changesTheResult(bestCp: number, impactCp: number): boolean {
  return (
    winningChances(bestCp) - winningChances(bestCp - impactCp) >= RESULT_CHANGE
  );
}

// A tactic is always worth serving. A plan position is served only when one
// move is clearly best, because otherwise several moves are equally right.
export function isServableMoment(
  fen: string,
  line: readonly string[],
  candidates: readonly { readonly evaluationCp: number }[],
): boolean {
  return tacticKind(fen, line) !== undefined || hasClearBestMove(candidates);
}
