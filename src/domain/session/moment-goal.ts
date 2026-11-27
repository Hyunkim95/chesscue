import { tacticKind } from "../analysis/explain-miss";

// What the player is working towards in a position, stated before they move
// (owner decision, 27 November 2026). A tactic says what it wins without
// naming the idea; a plan position states the idea's goal.
export type MomentGoal =
  | { readonly kind: "mate"; readonly prompt: string }
  | { readonly kind: "material"; readonly prompt: string }
  | { readonly kind: "plan"; readonly prompt: string };

// Quiet positions usually have several good moves, so any move this close to
// Stockfish's best counts as a find.
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
  return {
    kind: "plan",
    prompt: unitGoal
      ? `Goal: ${sentence(unitGoal)}`
      : "Goal: find the move that does the most for your position.",
  };
}
