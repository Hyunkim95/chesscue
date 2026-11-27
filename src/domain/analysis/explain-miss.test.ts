import { expect, test } from "vitest";

import { explainMissedLine } from "./explain-miss";

test("explains a missed knight fork and what it wins", () => {
  const explanation = explainMissedLine({
    fen: "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35",
    line: ["f3g5", "f7f6", "g5e6", "f4g3", "f2g3", "f6e6"],
    playedSan: "gxf4",
    scores: { bestCp: 723, playedCp: -60 },
  });
  expect(explanation?.text).toBe(
    "Nxg5+ attacks the black king on f7 and the black queen on e6 at the same time. " +
      "After Black replies Kf6, Nxe6 takes the black queen on e6. " +
      "White ends up 10 points of material ahead. " +
      "You played gxf4 instead, which Stockfish rates 7.8 pawns worse.",
  );
});

test("does not claim a pinned queen cannot take the piece that pins it", () => {
  const explanation = explainMissedLine({
    fen: "r4rk1/p1p1bppp/1p6/3PP1q1/3Q2P1/3B1PBb/PP2R2P/R5K1 b - - 1 22",
    line: ["e7c5", "d4c5", "b6c5", "a1e1", "h7h5", "e5e6"],
  });
  expect(explanation?.text).toMatch(
    /^Bc5 attacks the white queen on d4, which is pinned to its king\. After White replies Qxc5, bxc5 takes the white queen on c5/,
  );
  expect(explanation?.text).not.toMatch(/cannot capture/);
});

test("names a missed mate and the played move's verdict", () => {
  const explanation = explainMissedLine({
    fen: "r3n2k/6pp/1np1r3/p2p4/P2b2P1/2N3BP/1PP3K1/3R1R2 w - - 0 28",
    line: ["f1f8"],
    playedSan: "Rxd4",
    scores: { bestCp: 99_999, playedCp: 27 },
  });
  expect(explanation?.text).toBe(
    "Rf8# is checkmate on the back rank. The king on h8 is stuck behind its own pieces on g7, h7. You played Rxd4 instead, which misses a forced checkmate.",
  );
});

test("keeps a smothered mate apart from a back-rank mate", () => {
  const explanation = explainMissedLine({
    fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1",
    line: ["g5f7"],
  });
  expect(explanation?.text).toBe(
    "Nf7# is checkmate. The king on h8 is boxed in by its own pieces on g7, g8, h7.",
  );
});

test("leaves quiet lines and illegal lines to other explanations", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  expect(
    explainMissedLine({ fen: start, line: ["e2e4", "e7e5", "g1f3"] }),
  ).toBeUndefined();
  expect(explainMissedLine({ fen: start, line: ["e2e5"] })).toBeUndefined();
  expect(explainMissedLine({ fen: start, line: [] })).toBeUndefined();
});

test("reads further and names every skipped move when the payoff comes late", () => {
  // The mate lands on White's fourth move, past the three-move reading.
  const explanation = explainMissedLine({
    fen: "6k1/5ppp/p1p1rb2/8/3p4/2q1B1QP/Pr3PP1/1R2R1K1 w - - 0 23",
    line: ["g3b8", "b2b8", "b1b8", "f6d8", "b8d8", "e6e8", "d8e8"],
    playedSan: "Rxb2",
    scores: { bestCp: 99_996, playedCp: -488 },
  });
  expect(explanation?.text).toBe(
    "Qb8+ gives check. After Rxb8 Rxb8+ Bd8 Rxd8+ Re8, Rxe8# is checkmate on the back rank. " +
      "The king on g8 is stuck behind its own pieces on f7, g7, h7. " +
      "You played Rxb2 instead, which misses a forced checkmate.",
  );
});
