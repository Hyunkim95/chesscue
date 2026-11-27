import { Chess } from "chess.js";
import { expect, test } from "vitest";

import { explainLinePlan, explainLineStep } from "./explain-line-step";

test("connects a loss of square control to the later capture", () => {
  const board = new Chess(
    "4rrk1/6b1/p3N1B1/1p5p/2n2p1P/1Q3P2/PP3q2/1K1RR3 b - - 0 25",
  );
  const line = ["Nd2+", "Rxd2", "Qxe1+"].map((san) => board.move(san));

  expect(explainLineStep(line, 2)).toBe(
    "White’s rook left d1 and no longer covers e1. Black takes the rook there, and White cannot recapture on e1.",
  );
});

test("explains a verified first-move mate and a reply allowed by the attempted move", () => {
  const fen = "5Qr1/1pp1rn2/p2p3R/4kp2/2B5/2P1q1P1/PP5P/7K w - - 0 32";
  const board = new Chess(fen);
  const attempt = new Chess(fen);
  const plan = explainLinePlan(
    [board.move("Qxe7#")],
    [attempt.move("Qxg8"), attempt.move("Qxh6")],
  );
  expect(plan).toMatchObject({ step: 0 });
  expect(plan?.text).toContain("Qxe7# checks the king on e5");
  expect(plan?.text).toContain("the rook on h6");
  expect(plan?.text).toContain("no legal reply");
  expect(plan?.text).toContain("After Qxg8, Black can play Qxh6");
});
