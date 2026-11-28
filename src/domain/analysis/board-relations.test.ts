import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { staticExchange } from "./board-relations";

describe("staticExchange", () => {
  it("wins the full value of an undefended piece", () => {
    const board = new Chess("4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1");
    expect(staticExchange(board, "d5", "w")).toBe(3);
  });

  it("counts a pawn capturing a queen that two pieces defend", () => {
    const board = new Chess(
      "rnbqkbnr/pppp1ppp/8/4p3/3Q4/2P2N2/PP1PPPPP/RNB1KB1R b KQkq - 1 4",
    );
    expect(staticExchange(board, "d4", "b")).toBe(8);
  });

  it("declines a capture that loses a knight for two pawns", () => {
    const board = new Chess(
      "r1bqkb1r/pppppppp/1n3n2/3P4/4P3/8/PPP1QPPP/RNB1KBNR b KQkq - 0 4",
    );
    expect(staticExchange(board, "d5", "b")).toBe(-1);
  });

  it("includes a rook stacked behind the first attacker", () => {
    const board = new Chess("3r2k1/8/8/3p4/8/8/3R4/3R2K1 w - - 0 1");
    expect(staticExchange(board, "d5", "w")).toBe(1);
  });

  it("does not let the king capture onto a defended square", () => {
    const board = new Chess("8/8/8/1p6/2p5/3K4/8/7k w - - 0 1");
    expect(staticExchange(board, "c4", "w")).toBe(0);
  });

  it("leaves the board it was given unchanged", () => {
    const fen = "3r2k1/8/8/3p4/8/8/3R4/3R2K1 w - - 0 1";
    const board = new Chess(fen);
    staticExchange(board, "d5", "w");
    expect(board.fen()).toBe(fen);
  });
});
