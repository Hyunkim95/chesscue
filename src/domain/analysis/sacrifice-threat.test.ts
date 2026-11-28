import { Chess } from "chess.js";
import { expect, test } from "vitest";

import {
  sacrificeStoryboard,
  sacrificeThreat,
  takeBack,
} from "./sacrifice-threat";

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
    mateFrom: "h3",
    mateSquare: "h7",
    mateUci: "h3h7",
    mateSan: "Qh7#",
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

test("finds the cheapest take-back", () => {
  expect(takeBack(GREEK, "d3h7")).toBe("g8h7");
  expect(takeBack(GREEK, "h2h3")).toBeUndefined();
});

test("plays the take-back line with the mate square outlined", () => {
  const line = uci(GREEK, ["Bxh7+", "Kxh7", "Ng5+", "Kg8", "Qh3"]);
  const threat = sacrificeThreat(GREEK, line);
  if (!threat) throw new Error("no threat");
  const frames = sacrificeStoryboard(GREEK, threat);
  expect(frames.map(({ moveUci }) => moveUci)).toEqual(line);
  expect(frames[0]?.caption).toBe(threat.text);
  expect(frames.at(-1)?.caption).toBe("Qh3 threatens Qh7#.");
  expect(frames.at(-1)?.outlines).toContainEqual({
    square: "h7",
    tone: "coral",
  });
  expect(frames.at(-1)?.arrows).toContainEqual({
    from: "h3",
    to: "h7",
    kind: "threat",
  });
});
