import { describe, expect, it } from "vitest";

import {
  type PositionAnalysis,
  checkFen,
  engineLines,
  evalLabel,
  moveVerdict,
  whiteCp,
} from "./next-move";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4, with Stockfish 19 at depth 20.
const TRAP = "r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
const TRAP_ANALYSIS: PositionAnalysis = {
  candidates: [
    {
      uci: "f3d4",
      evaluationCpFromSideToMove: 131,
      principalVariation: ["f3d4", "e5d4", "e1g1", "g8f6"],
      depth: 20,
    },
    {
      uci: "e1g1",
      evaluationCpFromSideToMove: 100,
      principalVariation: ["e1g1", "d4f3", "d1f3"],
      depth: 20,
    },
  ],
};
// After 4. Nxe5, Black to move.
const AFTER_NXE5: PositionAnalysis = {
  candidates: [
    {
      uci: "d8g5",
      evaluationCpFromSideToMove: 53,
      principalVariation: ["d8g5", "e1g1", "g5e5"],
      depth: 20,
    },
  ],
};

describe("evaluation labels", () => {
  it("reads every score from White's side with one decimal", () => {
    expect(whiteCp(53, "b")).toBe(-53);
    expect(evalLabel(131)).toBe("+1.3");
    expect(evalLabel(-53)).toBe("−0.5");
    expect(evalLabel(4)).toBe("0.0");
  });

  it("names a forced mate by its distance", () => {
    expect(evalLabel(100_000 - 3)).toBe("#3");
    expect(evalLabel(-(100_000 - 2))).toBe("−#2");
  });
});

describe("engine lines", () => {
  it("numbers each line and writes it in SAN from White's side", () => {
    const lines = engineLines(TRAP, TRAP_ANALYSIS);
    expect(lines.map(({ rank, label }) => [rank, label])).toEqual([
      [1, "+1.3"],
      [2, "+1.0"],
    ]);
    expect(lines[0]?.moves.map(({ san, color }) => [san, color])).toEqual([
      ["Nxd4", "w"],
      ["exd4", "b"],
      ["O-O", "w"],
      ["Nf6", "b"],
    ]);
    expect(lines[1]?.moves.map(({ fen }) => fen).at(-1)).toBe(
      "r1bqkbnr/pppp1ppp/8/4p3/2B1P3/5Q2/PPPP1PPP/RNB2RK1 b kq - 0 5",
    );
  });

  it("drops a line whose first move is illegal and stops a line at an illegal move", () => {
    const lines = engineLines(START, {
      candidates: [
        {
          uci: "e2e5",
          evaluationCpFromSideToMove: 0,
          principalVariation: ["e2e5"],
          depth: 1,
        },
        {
          uci: "e2e4",
          evaluationCpFromSideToMove: 30,
          principalVariation: ["e2e4", "e2e4"],
          depth: 1,
        },
      ],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.rank).toBe(1);
    expect(lines[0]?.moves.map(({ san }) => san)).toEqual(["e4"]);
  });
});

describe("checking a pasted FEN", () => {
  it("accepts a legal position and fills missing fields", () => {
    expect(checkFen(`  ${TRAP}  `)).toEqual({ ok: true, value: TRAP });
    expect(checkFen("8/8/8/4k3/8/8/8/4K2R b")).toEqual({
      ok: true,
      value: "8/8/8/4k3/8/8/8/4K2R b - - 0 1",
    });
  });

  it("explains what is wrong in plain words", () => {
    expect(
      checkFen("r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQKK1R w - - 4 4"),
    ).toEqual({ ok: false, error: "White has two kings." });
    expect(checkFen("8/8/8/8/8/8/8/4K3 w - - 0 1")).toEqual({
      ok: false,
      error: "Black has no king.",
    });
    expect(checkFen("hello")).toEqual({
      ok: false,
      error: "That doesn't look like a FEN.",
    });
  });

  it("refuses a position where the side not to move is in check", () => {
    expect(checkFen("4k3/8/8/8/8/8/8/4K2r b - - 0 1")).toEqual({
      ok: false,
      error: "White is in check, so it can't be Black's move.",
    });
  });

  it("drops castling rights the pieces no longer allow", () => {
    expect(checkFen("4k3/8/8/8/8/8/8/4K3 w KQkq - 0 1")).toEqual({
      ok: true,
      value: "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
    });
  });
});

describe("what a played move does", () => {
  it("says what it does, Rook's answer, and what was best", () => {
    expect(
      moveVerdict({
        fen: TRAP,
        playedUci: "f3e5",
        before: TRAP_ANALYSIS,
        after: AFTER_NXE5,
      }),
    ).toEqual({
      caption: "Nxe5 takes my pawn, but I answer Qg5, aiming at e5 and d2.",
      tier: "missed",
      chip: "+1.3 → −0.5 · Nxd4 was best",
    });
  });

  it("calls the best move best", () => {
    expect(
      moveVerdict({
        fen: TRAP,
        playedUci: "f3d4",
        before: TRAP_ANALYSIS,
        after: {
          candidates: [
            {
              uci: "e5d4",
              evaluationCpFromSideToMove: -131,
              principalVariation: ["e5d4"],
              depth: 20,
            },
          ],
        },
      }),
    ).toEqual({
      caption: "Nxd4 takes my knight, and I take your knight with exd4.",
      tier: "best",
      chip: "Best move · +1.3",
    });
  });

  it("calls a move close to the best good, and names the best", () => {
    expect(
      moveVerdict({
        fen: TRAP,
        playedUci: "e1g1",
        before: TRAP_ANALYSIS,
        after: {
          candidates: [
            {
              uci: "d4f3",
              evaluationCpFromSideToMove: -110,
              principalVariation: ["d4f3"],
              depth: 20,
            },
          ],
        },
      })?.chip,
    ).toBe("Good move · +1.1 · Nxd4 was +1.3");
  });

  it("needs no engine after mate", () => {
    expect(
      moveVerdict({
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
        playedUci: "h5f7",
        before: undefined,
        after: undefined,
      }),
    ).toEqual({
      caption: "Qxf7# is checkmate.",
      tier: "best",
      chip: "Checkmate",
    });
  });

  it("shows only the new evaluation when the first search had not finished", () => {
    expect(
      moveVerdict({
        fen: TRAP,
        playedUci: "f3e5",
        before: undefined,
        after: AFTER_NXE5,
      }),
    ).toEqual({
      caption: "Nxe5 takes my pawn, and I answer Qg5, aiming at e5 and d2.",
      tier: undefined,
      chip: "Now −0.5",
    });
  });
});
