import { Chess } from "chess.js";
import { expect, test } from "vitest";

import { sacrificeThreat } from "./sacrifice-threat";

const uci = (fen: string, sans: readonly string[]) => {
  const board = new Chess(fen);
  return sans.map((san) => board.move(san).lan);
};

// Lichess qAmdmtgs (KPI case 24): the Greek gift.
const GREEK =
  "1r3rk1/1b1n1ppp/pqpNp3/1p1nP3/3P4/Q2B1N2/P4PPP/2RR2K1 w - - 3 18";

test("names the mate threat after the sacrifice is taken back", () => {
  const line = uci(GREEK, ["Bxh7+", "Kxh7", "Ng5+", "Kg8", "Qh3"]);
  expect(sacrificeThreat(GREEK, line)).toEqual({
    text: "Bxh7+ takes a pawn with check. If Black takes the bishop, Ng5+ and Qh3 threaten mate on h7.",
    line,
    mateSquare: "h7",
    mateUci: "h3h7",
  });
});

test("says nothing when the opponent does not take back", () => {
  expect(
    sacrificeThreat(GREEK, uci(GREEK, ["Bxh7+", "Kh8", "Ng5", "f6"])),
  ).toBeUndefined();
});

test("says nothing when the moves before the threat are not forcing", () => {
  // A quiet move first gives the defender time.
  expect(
    sacrificeThreat(
      GREEK,
      uci(GREEK, ["Bxh7+", "Kxh7", "h3", "Kg8", "Ng5", "Rfe8", "Qd3"]),
    ),
  ).toBeUndefined();
});

test("says nothing about a move that is not a capture or a check", () => {
  expect(
    sacrificeThreat(GREEK, uci(GREEK, ["h3", "f5", "exf6"])),
  ).toBeUndefined();
});
