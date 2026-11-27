import { expect, it } from "vitest";

import { centreControlChange } from "./centre-control";
import { tacticKind } from "./explain-miss";

it("names the central squares a developing move starts to control", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  expect(centreControlChange(start, "g1f3")).toEqual({
    gained: ["d4", "e5"],
    lost: [],
  });
  expect(centreControlChange(start, "a1a8")).toEqual({ gained: [], lost: [] });
});

it("tells a mate from a material win and a quiet line", () => {
  const warmUp = "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19";
  expect(tacticKind(warmUp, ["g4g5", "g8h8", "g5g7"])).toBe("mate");
  const fork = "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35";
  expect(
    tacticKind(fork, ["f3g5", "f7f6", "g5e6", "f4g3", "f2g3", "f6e6"]),
  ).toBe("material");
  expect(
    tacticKind("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [
      "g1f3",
    ]),
  ).toBeUndefined();
});
