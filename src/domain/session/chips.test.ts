import { describe, expect, it } from "vitest";

import { chipsFor, type ChipContext } from "./chips";
import type { SessionKind } from "./types";

// Ng5+ forks the king and queen; Black's rook on b5 can take on c5.
const FORK: ChipContext = {
  fen: "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35",
  bestUci: "f3g5",
  playedInGame: { uci: "g3f4", san: "gxf4" },
  reply: { uci: "f7g8", san: "Kg8" },
  bestNonSolution: { uci: "e3f4", san: "exf4" },
  bestDefence: { uci: "f7g6", san: "Kg6" },
  quiet: false,
  online: false,
};

const labels = (kind: SessionKind, context: ChipContext = FORK) =>
  chipsFor(kind, context).map(({ label }) => label);

describe("chipsFor", () => {
  it("offers the design's chips for each state", () => {
    expect(labels("before")).toEqual([
      "What are you threatening?",
      "Any checks for me?",
      "Why not gxf4?",
    ]);
    expect(labels("tried")).toEqual(["Why Kg8?", "Your threats now?"]);
    expect(labels("second-miss")).toEqual(["Scan for me", "What if exf4?"]);
    expect(labels("solved")).toEqual([
      "Why does it work?",
      "What if you'd played Kg6?",
      "Done ✓",
    ]);
    // After Show me the player can still ask about the answer.
    expect(labels("shown")).toEqual([
      "Why does it work?",
      "What if you'd played Kg6?",
      "Done ✓",
    ]);
    expect(labels("done")).toEqual([]);
  });

  it("never names the best move before the position is solved", () => {
    const leaky: ChipContext = {
      ...FORK,
      playedInGame: { uci: "f3g5", san: "Ng5+" },
      reply: { uci: "f3g5", san: "Ng5+" },
      bestNonSolution: { uci: "f3g5", san: "Ng5+" },
    };
    for (const kind of ["before", "tried", "second-miss"] as const)
      for (const chip of chipsFor(kind, leaky)) {
        expect(chip.label).not.toContain("Ng5");
        expect("uci" in chip.action && chip.action.uci).not.toBe("f3g5");
      }
  });

  it("hides chips whose condition does not hold", () => {
    const quietStart: ChipContext = {
      fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
      bestUci: "e1e2",
      quiet: true,
      online: false,
    };
    expect(labels("before", quietStart)).toEqual([]);
    expect(labels("before", { ...quietStart, online: true })).toEqual([
      "What's the plan?",
    ]);
  });
});
