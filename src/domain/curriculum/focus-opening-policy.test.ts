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

  it("steers only along the published branch for the selected theme", () => {
    for (const e of focusOpeningPolicyEntries) {
      const focus =
        e.theme === "premature-central-exchange"
          ? "central-pawn-tension"
          : e.theme;
      const input: Parameters<typeof focusOpeningCandidates>[0] = {
        focus,
        fen: e.fen,
        moves: e.afterMoves,
      };
      expect(focusOpeningCandidates(input)).toContain(e.candidateMoves[0]);
      expect(
        focusOpeningCandidates({ ...input, policyVersion: "retired" }),
      ).toEqual([]);
    }
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
