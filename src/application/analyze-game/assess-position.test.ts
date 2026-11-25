import { Chess } from "chess.js";
import { describe, expect, it, vi } from "vitest";

import { materialBalance } from "../../domain/game/board-balance";
import { ok } from "../../shared/result/result";
import { assessPosition } from "./assess-position";

describe("board balance", () => {
  it("counts material from the current pieces rather than the move history", () => {
    const board = new Chess();
    for (const move of ["e4", "d5", "exd5"]) board.move(move);
    expect(materialBalance(board.fen())).toBe(1);
    board.move("Qxd5");
    expect(materialBalance(board.fen())).toBe(0);
  });

  it("computes the signed lead when different piece types were traded", () => {
    const board = new Chess();
    for (const move of [
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
      "d6",
      "Nc3",
      "Bg4",
      "Nxe5",
      "Bxd1",
    ])
      board.move(move);
    expect(materialBalance(board.fen())).toBe(-8);
  });

  it("reports the estimate from White's perspective and rejects illegal lines", async () => {
    const board = new Chess();
    board.move("e4");
    const engine = {
      initialize: vi.fn(() => Promise.resolve(ok(undefined))),
      analyze: vi.fn(() =>
        Promise.resolve(
          ok({
            candidates: [
              {
                uci: "a8a1",
                principalVariation: ["a8a1"],
                depth: 10,
                evaluationCpFromSideToMove: -900,
              },
              {
                uci: "c7c5",
                principalVariation: ["c7c5"],
                depth: 10,
                evaluationCpFromSideToMove: 61,
              },
            ],
          }),
        ),
      ),
      dispose: vi.fn(),
    };
    await expect(
      assessPosition(engine, board.fen(), new AbortController().signal),
    ).resolves.toEqual({ kind: "estimate", whiteCentipawns: -61 });
  });
});
