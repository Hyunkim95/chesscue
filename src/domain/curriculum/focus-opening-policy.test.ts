import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import {
  focusOpeningCandidates,
  focusOpeningPolicyEntries,
} from "./focus-opening-policy";

const positionAfter = (moves: readonly string[]): string => {
  const game = new Chess();
  for (const uci of moves) {
    game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
  }
  return game.fen();
};

describe("focus opening policy", () => {
  it("contains only replayable positions and legal CPU candidates", () => {
    for (const entry of focusOpeningPolicyEntries) {
      const fen = positionAfter(entry.afterMoves);
      expect(new Chess(fen).turn()).toBe("b");
      for (const move of entry.candidateMoves) {
        const game = new Chess(fen);
        expect(() =>
          game.move({ from: move.slice(0, 2), to: move.slice(2, 4) }),
        ).not.toThrow();
      }
    }
  });

  it("steers piece-pressure play toward a normal attacked-bishop branch", () => {
    const moves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"];
    expect(
      focusOpeningCandidates({
        focus: "hanging-piece",
        fen: positionAfter(moves),
        moves,
      }),
    ).toEqual(["a7a6"]);
  });

  it("steers central-tension play without forcing the learner's moves", () => {
    const moves = ["d2d4", "d7d5", "c2c4"];
    expect(
      focusOpeningCandidates({
        focus: "central-pawn-tension",
        fen: positionAfter(moves),
        moves,
      }),
    ).toEqual(["e7e6", "c7c6"]);
  });

  it("falls back to unrestricted Stockfish after an unmatched line", () => {
    const moves = ["a2a3"];
    expect(
      focusOpeningCandidates({
        focus: "calculation",
        fen: positionAfter(moves),
        moves,
      }),
    ).toEqual([]);
  });
});
