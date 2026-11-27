import { expect, it } from "vitest";

import { lineStoryboard } from "./line-storyboard";

it("draws the fork, the forced reply and the mate", () => {
  const frames = lineStoryboard(
    "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19",
    ["g4g5", "g8h8", "g5g7"],
  );
  expect(frames.map(({ caption }) => caption)).toEqual([
    "Qxg5+ takes my pawn, checks my king and attacks my knight on d2, which nothing defends.",
    "I have to play Kh8.",
    "Qg7# is checkmate.",
  ]);
  expect(frames[0]?.arrows).toEqual([
    { from: "g4", to: "g5", kind: "preview" },
    { from: "g5", to: "g8", kind: "attack" },
    { from: "g5", to: "d2", kind: "attack" },
  ]);
  expect(frames[2]?.arrows).toContainEqual({
    from: "g7",
    to: "h8",
    kind: "attack",
  });
  expect(frames[2]?.outlines).toEqual([{ square: "h8", tone: "coral" }]);
});

it("stops at an illegal move and refuses a bad position", () => {
  expect(
    lineStoryboard("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", ["e2e4", "a1a8"]),
  ).toHaveLength(1);
  expect(lineStoryboard("not a fen", ["e2e4"])).toEqual([]);
});

it("starts with Rook's move when the line is a what-if for his defence", () => {
  // After 1. Ng5+ in the fork position, Rook tries Kf6 instead of Kg8.
  const frames = lineStoryboard(
    "2r5/5k2/4q3/1rBp2N1/p2P1p2/PpR3Pp/1P2KP1P/2R5 b - - 0 35",
    ["f7f6", "g5e6", "f6e6"],
    "w",
  );
  expect(frames.map(({ by }) => by)).toEqual(["rook", "learner", "rook"]);
  expect(frames[0]?.caption).toBe("I answer Kf6+.");
  expect(frames[1]?.caption).toBe(
    "Nxe6 takes my queen and attacks my pawn on f4, which nothing defends.",
  );
});

it("shows a quiet move by the central squares it takes control of", () => {
  const [frame] = lineStoryboard(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    ["g1f3"],
  );
  expect(frame?.caption).toBe("Nf3 adds control of d4 and e5 in the centre.");
  expect(frame?.control).toEqual([
    { square: "d4", change: "gained" },
    { square: "e5", change: "gained" },
  ]);
});
