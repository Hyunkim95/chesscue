import { describe, expect, it } from "vitest";

import { classifyLearningTheme } from "./classify-theme";

describe("classifyLearningTheme", () => {
  it("classifies a premature central pawn exchange deterministically", () => {
    expect(
      classifyLearningTheme({
        fenBefore:
          "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2",
        playedMoveUci: "e4d5",
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
});
