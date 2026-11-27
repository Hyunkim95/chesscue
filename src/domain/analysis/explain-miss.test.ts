import { expect, test } from "vitest";

import {
  explainAllowedLine,
  explainMissedLine,
  isTacticLine,
  tacticKind,
} from "./explain-miss";

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
      "After fxg3 fxg3 Kxe6, White wins 7 points of material and ends up 5 points ahead. " +
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

// Lichess xgVc8lEx, ply 29: the leading sentence named the pinned pawn in
// lower case and never said which move it could not take.
test("names the move a pinned piece cannot take back, in a full sentence", () => {
  const explanation = explainMissedLine({
    fen: "r3k3/1pp2p2/2np2rp/p1b1p3/2P4B/P2P1PPq/1P2BP1P/R2Q1RK1 b q - 2 15",
    line: ["h3h4", "f3f4", "e5f4", "g1h1", "h4f6", "e2f3", "e8f8", "f3e4"],
    playedSan: "Kd7",
    scores: { bestCp: 581, playedCp: -8 },
  });
  expect(explanation?.text).toBe(
    "Qxh4 takes the white bishop on h4, and the white pawn on g3 cannot take back because it is pinned to its king. " +
      "After White replies f4, exf4 takes the white pawn on f4. " +
      "Black wins 4 points of material and ends up 3 points ahead. " +
      "You played Kd7 instead, which Stockfish rates 5.9 pawns worse.",
  );
});

// Lichess games-claims case 12: Black starts 3 points down, so winning 3
// back levels the material rather than putting Black ahead.
test("reports the material balance the line ends with, not only the gain", () => {
  const explanation = explainMissedLine({
    fen: "r3r1k1/1pq2pbp/p1pn2p1/P1Np1b2/Q2PB3/1P2P1P1/4NP1P/R1B2RK1 b - - 0 19",
    line: ["d6e4", "c5e4", "d5e4", "g1g2", "f5g4", "e2g1", "a8d8", "h2h3"],
  });
  expect(explanation?.text).toBe(
    "Nxe4 takes the white bishop on e4. After White replies Nxe4, dxe4 takes the white knight on e4, which had no defender. " +
      "Black wins 3 points of material and levels the material.",
  );
  expect(explanation?.text).not.toMatch(/ahead/);
});

test("says a quiet move is safe from a pinned attacker", () => {
  // The rook on g6 pins the g3 pawn, the only piece attacking h4.
  const explanation = explainMissedLine({
    fen: "7k/4q3/6r1/8/3N4/6P1/P4P1P/6K1 b - - 0 1",
    line: ["e7h4", "a2a3", "h4d4"],
  });
  expect(explanation?.text).toBe(
    "Qh4 is safe from the white pawn on g3, which is pinned to its king. " +
      "After White replies a3, Qxd4 takes the white knight on d4, which had no defender. " +
      "Black wins 3 points of material and ends up 10 points ahead.",
  );
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

// What the player's own move allowed, from real Lichess games graded by two
// coaches (research_notes/positional-reasons, audit cases 13, 16, 17 and 3).
test("explains the fork a king move allowed, naming the player's pieces as yours", () => {
  expect(
    explainAllowedLine({
      fen: "r5nr/pppkbpp1/n2p1q1p/1Q1Pp3/4P3/2N2N2/PPP2PPP/R1B1K2R b KQ - 3 10",
      line: ["d7d8", "b5b7", "a8b8", "b7a6", "f6g6", "e1g1"],
    })?.text,
  ).toBe(
    "After Kd8, White plays Qxb7, attacking your rook on a8 (undefended) and your knight on a6 (undefended) at the same time. " +
      "After you reply Rb8, Qxa6 takes your knight on a6, which had no defender. " +
      "White ends up 4 points of material ahead.",
  );
});

test("names the capture before the discovered attack it opens", () => {
  expect(
    explainAllowedLine({
      fen: "2kr3r/1pp2pp1/p1nbqn2/3p3p/3N4/1P2P1P1/PBP2PBP/R2QK2R b KQ - 0 13",
      line: ["d6e5", "d4e6", "e5b2", "e6d8", "b2c3", "e1f1"],
    })?.text,
  ).toBe(
    "After Be5, White plays Nxe6, taking your queen on e6. " +
      "Moving the knight off d4 opens the line for the white bishop on b2, which now attacks your bishop on e5. " +
      "After you reply Bxb2, Nxd8 takes your rook on d8. " +
      "White ends up 11 points of material ahead.",
  );
});

// Lichess CmFQb10N: g6 leaves the queen on d7 to the rook on d1.
test("says when the reply takes a piece that had no defender", () => {
  expect(
    explainAllowedLine({
      fen: "r4rk1/pp1q1ppn/2p1p3/4P2p/1P6/P1N3PP/2P1QP2/3R1RK1 b - - 0 20",
      line: ["g7g6", "d1d7", "a7a5", "c3e4", "a5b4", "a3b4", "b7b6", "f1d1"],
    })?.text,
  ).toMatch(
    /^After g6, White plays Rxd7, taking your queen on d7, which had no defender\. /,
  );
});

// Bxd6 takes a bishop and Nxd6+ only takes one back: the move cost nothing
// within the line, so there is no material lesson to state.
test("counts what the player's own move took before the reply", () => {
  expect(
    explainAllowedLine({
      fen: "2N1kb1r/1p1n1ppp/3Bpn2/3p4/6b1/5N2/qPP1Q1PP/2KR1B1R b k - 1 13",
      line: ["f8d6", "c8d6", "e8e7"],
    }),
  ).toBeUndefined();
});

test("stays silent when the reply wins material without a tactic to name", () => {
  expect(
    explainAllowedLine({
      fen: "r1b2rk1/pp2bppp/1q2p3/4N3/1n1Pp3/1P2B2P/P4PP1/RN1QR1K1 b - - 1 15",
      line: ["e7d6", "b1d2", "f7f5", "d2c4", "b6a6", "c4d6", "a6d6", "e3c1"],
    }),
  ).toBeUndefined();
});

// Lichess hG16B4qa: Qxe8 wins the queen inside the usual reach, but Bxe8
// takes it straight back, so the line wins one point, not a tactic.
test("does not call a line a tactic when its gain is taken straight back", () => {
  const fen =
    "r2qk2r/np1bb1p1/p1p1p1pp/3pP3/3P3P/P1N2NB1/1PP1QPP1/2KR3R w kq - 0 14";
  const line = ["e2d3", "e8g8", "d3g6", "d8e8", "g6e8", "d7e8", "c3e2", "e8h5"];
  expect(tacticKind(fen, line)).toBeUndefined();
  expect(isTacticLine(fen, line)).toBe(false);
});

// Lichess xG8bSTZ3: Nxe6 wins the queen and dxe6 only takes a knight back.
test("still calls a line a tactic when it wins material after the take-back", () => {
  expect(
    tacticKind("r1bq1bkr/pppp2pp/2n5/4p3/4N3/5Q2/PPPP1PPP/RNB1K2R w KQ - 2 8", [
      "e4g5",
      "d8f6",
      "f3d5",
      "f6e6",
      "g5e6",
      "d7e6",
      "d5e4",
      "f8d6",
    ]),
  ).toBe("material");
});
