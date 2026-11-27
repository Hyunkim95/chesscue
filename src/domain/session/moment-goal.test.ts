import { expect, it } from "vitest";

import { momentGoal } from "./moment-goal";

it("states the goal without naming a tactic, and names a plan's goal", () => {
  expect(
    momentGoal(
      "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19",
      ["g4g5", "g8h8", "g5g7"],
      "Find a move or preparation that attacks two targets.",
    ),
  ).toEqual({ kind: "mate", prompt: "There's a forced mate here." });
  expect(
    momentGoal(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      ["g1f3"],
      "Develop a piece or support the centre while keeping the king safe.",
    ),
  ).toEqual({
    kind: "plan",
    prompt:
      "Goal: develop a piece or support the centre while keeping the king safe.",
  });
});
