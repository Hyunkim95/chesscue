import { Chess } from "chess.js";
import { expect, test } from "vitest";

import {
  describedMoves,
  routeExploration,
  writtenMove,
} from "./exploration-intent";

// Lichess puzzle 0Uxzm: White to move, Nxg5+ forks the king and queen.
const FORK = "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35";

test("reads a legal move written in notation, with or without check", () => {
  expect(writtenMove("why is Nxg5 better?", FORK)?.san).toBe("Nxg5+");
  expect(writtenMove("what if Ne5+", FORK)?.san).toBe("Ne5+");
  expect(writtenMove("why was gxf4 bad", FORK)?.san).toBe("gxf4");
});

test("ignores illegal notation and squares that are not moves", () => {
  expect(writtenMove("what if Qh5", FORK)).toBeUndefined();
  expect(writtenMove("the pawn on g5", FORK)).toBeUndefined();
});

test("asks for the move on the board when the message only describes it", () => {
  expect(
    routeExploration({
      intent: "what-if",
      text: "can i take the pawn with the knight?",
      fen: FORK,
    }),
  ).toEqual({ kind: "play-it-on-the-board", intent: "what-if" });
});

test("uses the board move when the message names none", () => {
  const boardMove = new Chess(FORK).move("Nxg5+");
  const route = routeExploration({
    intent: "why",
    text: "why does this work?",
    fen: FORK,
    boardMove,
  });
  expect(route.kind === "why" && route.move.san).toBe("Nxg5+");
});

test("passes other intents through without a move", () => {
  expect(
    routeExploration({ intent: "hint", text: "hint please", fen: FORK }),
  ).toEqual({ kind: "hint" });
});

test("reads a move described in words from the given moves", () => {
  const line = [
    { uci: "g4g5", san: "Qxg5+" },
    { uci: "g8h8", san: "Kh8" },
    { uci: "g5g7", san: "Qg7#" },
  ];
  expect(describedMoves("why would queen take", line)).toEqual([line[0]]);
  expect(describedMoves("why did the king move", line)).toEqual([line[1]]);
  expect(describedMoves("why the queen to g7", line)).toEqual([line[2]]);
  expect(describedMoves("why is this good?", line)).toEqual([]);
  // On the board: both queen captures in the warm-up start position.
  const board = new Chess(
    "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19",
  )
    .moves({ verbose: true })
    .map(({ lan, san }) => ({ uci: lan, san }));
  expect(
    describedMoves("why would the queen take", board).map(({ san }) => san),
  ).toEqual(expect.arrayContaining(["Qxg5+"]));
});

test("reads a capture from the piece that was taken", () => {
  const line = [
    { uci: "g5d2", san: "Qxd2", captured: "n" },
    { uci: "c7e5", san: "Qxe5", captured: "p" },
  ];
  expect(describedMoves("why did you take my pawn", line)).toEqual([line[1]]);
  expect(describedMoves("why take the knight", line)).toEqual([line[0]]);
  expect(describedMoves("why would the queen take", line)).toEqual(line);
});

test("reads where a move lands from the piece it ends up beside", () => {
  // The player's game: White's queen on c2 is attacked by ...Bf5.
  const fen =
    "r3r1k1/ppp2ppp/3p1q2/2n2bN1/N1PP4/8/PPQ1P1PP/R1B1KB1R w KQ - 1 14";
  const legal = new Chess(fen)
    .moves({ verbose: true })
    .map(({ lan, san, captured }) => ({ uci: lan, san, captured }));
  expect(
    describedMoves("what if queen moves next to king", legal, fen)
      .map(({ san }) => san)
      .toSorted(),
  ).toEqual(["Qd1", "Qd2"]);
  // The piece that moves is the first one named, not the first in a list.
  expect(
    describedMoves("what if the queen goes beside the king", legal, fen).every(
      ({ san }) => san.startsWith("Q"),
    ),
  ).toBe(true);
});
