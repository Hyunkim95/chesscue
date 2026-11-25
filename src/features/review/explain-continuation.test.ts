import { Chess } from "chess.js";
import { expect, it } from "vitest";
import { explainContinuation } from "./explain-continuation";

it("explains what a quiet developing move opens", () => {
  const board = new Chess();
  const move = board.move("e4");
  expect(explainContinuation(move, board)).toMatch(
    /opens a line for the (bishop|queen)/,
  );
});

it("explains a pin and distinguishes it from a plain attack", () => {
  for (const [king, pinned] of [
    ["e8", true],
    ["g8", false],
  ] as const) {
    const board = new Chess(
      king === "e8"
        ? "4k3/8/2n5/8/8/8/5PPP/4KB2 w - - 0 1"
        : "6k1/8/2n5/8/8/8/5PPP/4KB2 w - - 0 1",
    );
    const move = board.move("Bb5");
    expect(
      explainContinuation(move, board).includes(
        "pins the knight on c6 to its king",
      ),
    ).toBe(pinned);
  }
});

it("links a reply to the defender the learner moved away", () => {
  const board = new Chess("1k6/4r3/8/8/8/4R3/3B4/6K1 w - - 0 1");
  const player = board.move("Ba5");
  const reply = board.move("Rxe3");
  expect(explainContinuation(reply, board, player)).toContain(
    "Moving your bishop off d2 left the rook on e3 without a defender.",
  );
});

it("counts a legal king recapture when the defender still covers the square", () => {
  const board = new Chess("1k6/8/8/4r3/8/8/4R3/4K3 w - - 0 1");
  const player = board.move("Kd1");
  const reply = board.move("Rxe2");
  expect(explainContinuation(reply, board, player)).toContain(
    "White can immediately recapture on e2",
  );
});
