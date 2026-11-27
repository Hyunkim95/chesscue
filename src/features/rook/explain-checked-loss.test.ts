import { Chess } from "chess.js";
import { expect, test } from "vitest";

import { explainCheckedLoss, isGenericLoss } from "./explain-checked-loss";

test("names a pawn fork even when the pawn can be taken", () => {
  // Be3 lets ...d4 attack the bishop and knight; the line wins the bishop.
  const fen =
    "r1b1kb1r/1p1n1p2/p1n1p2p/q1ppP1p1/5B2/1PNP1N2/P1PQBPPP/R4RK1 w kq - 0 11";
  const attempt = new Chess(fen).move("Be3");
  expect(
    explainCheckedLoss(
      attempt,
      { line: ["d5d4", "c3e4", "d4e3"], evaluationCpFromSideToMove: 441 },
      { line: ["f4g3", "f8g7", "a2a3"], evaluationCpFromSideToMove: -191 },
    ),
  ).toBe(
    "Black’s d4 attacks your bishop on e3 and knight on c3 at once, and the checked line leaves you with less material.",
  );
});

test("marks sentences without a concrete board fact as generic", () => {
  expect(
    isGenericLoss(
      "The checked line leaves you with less material than the alternative.",
    ),
  ).toBe(true);
  expect(isGenericLoss("Stockfish preferred Bg3 from the same position.")).toBe(
    true,
  );
  expect(isGenericLoss("Black can take the knight on d6.")).toBe(false);
});
