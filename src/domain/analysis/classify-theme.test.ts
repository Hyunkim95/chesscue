import { describe, expect, it } from "vitest";

import { classifyLearningTheme } from "./classify-theme";

describe("classifyLearningTheme", () => {
  it("classifies a premature central pawn exchange deterministically", () => {
    expect(
      classifyLearningTheme({
        fenBefore:
          "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2",
        playedMoveUci: "e4d5",
        bestMoveUci: "b1c3",
        ply: 3,
        impactCp: 80,
      }),
    ).toBe("premature-central-exchange");
  });

  it("uses a tactical theme for a large evaluation loss", () => {
    expect(
      classifyLearningTheme({
        fenBefore:
          "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 2",
        playedMoveUci: "f3g5",
        ply: 3,
        impactCp: 220,
      }),
    ).toBe("one-move-threat");
  });

  it("marks a queen left where a pawn can take it as hanging, even when defended twice", () => {
    expect(
      classifyLearningTheme({
        fenBefore:
          "rnbqkbnr/pppp1ppp/8/4p3/Q7/2P2N2/PP1PPPPP/RNB1KB1R w KQkq - 0 4",
        playedMoveUci: "a4d4",
        ply: 7,
        impactCp: 800,
      }),
    ).toBe("hanging-piece");
  });

  it("does not mark a pawn as hanging when taking it loses material", () => {
    expect(
      classifyLearningTheme({
        fenBefore:
          "r1bqkb1r/pppppppp/1n3n2/8/3PP3/8/PPP1QPPP/RNB1KBNR w KQkq - 0 4",
        playedMoveUci: "d4d5",
        ply: 7,
        impactCp: 260,
      }),
    ).toBe("one-move-threat");
  });
});
