import type { StarState } from "../../domain/progress";

export const starLabels = {
  "not-seen": "Not seen",
  missed: "Missed",
  spotted: "Spotted",
  shining: "Shining",
} as const satisfies Record<StarState, string>;

export function isLit(state: StarState | undefined) {
  return state === "spotted" || state === "shining";
}
