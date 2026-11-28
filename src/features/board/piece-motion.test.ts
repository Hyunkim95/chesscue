import { expect, it } from "vitest";

import { NO_MOTION, pieceMotion } from "./piece-motion";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const E4_D5 = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
const EXD5 = "rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2";

it("slides the one piece a move moved", () => {
  const motion = pieceMotion(START, E4);
  expect([...motion.slides]).toEqual([["e4", "e2"]]);
  expect(motion.appearing.size).toBe(0);
});

it("slides both pieces when two moves land at once, as after a reply", () => {
  const motion = pieceMotion(START, E4_D5);
  expect(new Map(motion.slides)).toEqual(
    new Map([
      ["e4", "e2"],
      ["d5", "d7"],
    ]),
  );
});

it("slides a capture back on Reset and fades the captured piece in", () => {
  const motion = pieceMotion(EXD5, E4_D5);
  expect([...motion.slides]).toEqual([["e4", "d5"]]);
  expect([...motion.appearing]).toEqual(["d5"]);
});

it("slides both castling pieces", () => {
  const before = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
  const after = "r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1";
  expect(new Map(pieceMotion(before, after).slides)).toEqual(
    new Map([
      ["f1", "h1"],
      ["g1", "e1"],
    ]),
  );
});

it("slides a promoted piece from its pawn", () => {
  const before = "8/4P3/8/8/8/8/k7/4K3 w - - 0 1";
  const after = "4Q3/8/8/8/8/8/k7/4K3 b - - 0 1";
  expect([...pieceMotion(before, after).slides]).toEqual([["e8", "e7"]]);
});

it("does not animate an unchanged, unrelated or unreadable position", () => {
  expect(pieceMotion(START, START)).toBe(NO_MOTION);
  expect(
    pieceMotion(
      START,
      "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35",
    ),
  ).toBe(NO_MOTION);
  expect(pieceMotion("not a fen", START)).toBe(NO_MOTION);
});
