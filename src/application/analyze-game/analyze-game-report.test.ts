import { Chess } from "chess.js";
import { expect, it, vi } from "vitest";

import { createGameId, type GameRecord } from "../../domain/game/types";
import { ok } from "../../shared/result/result";
import type { AnalysisEngine } from "./analysis-engine";
import { analyzeGameReport } from "./analyze-game-report";

const date = "2026-11-28T10:00:00.000Z";

function game(): GameRecord {
  const board = new Chess();
  const initialFen = board.fen();
  const moves = ["e4", "e5"].map((san, index) => {
    const move = board.move(san);
    return {
      ply: index + 1,
      san,
      uci: move.lan,
      fenAfter: board.fen(),
      playedAt: date,
    };
  });
  return {
    schemaVersion: 1,
    id: createGameId("report-test"),
    origin: { type: "pgn-paste" },
    initialFen,
    moves,
    pgn: board.pgn(),
    playerColor: "white",
    result: "draw",
    createdAt: date,
    completedAt: date,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    fingerprint: null,
  };
}

function engine() {
  const analyze = vi.fn<AnalysisEngine["analyze"]>();
  for (const [uci, evaluation] of [
    ["e2e4", 20],
    ["c7c5", -20],
    ["g1f3", 250],
  ] as const) {
    analyze.mockResolvedValueOnce(
      ok({
        candidates: [
          {
            uci,
            evaluationCpFromSideToMove: evaluation,
            depth: 13,
            principalVariation: [uci],
          },
        ],
      }),
    );
  }
  return {
    initialize: () => Promise.resolve(ok(undefined)),
    analyze,
    dispose: vi.fn(),
  };
}

it("checks each position once and grades moves from the mover’s perspective", async () => {
  const progress = vi.fn();
  const stockfish = engine();
  const result = await analyzeGameReport(
    game(),
    stockfish,
    new AbortController().signal,
    progress,
  );
  expect(stockfish.analyze).toHaveBeenCalledTimes(3);
  expect(progress.mock.calls).toEqual([
    [1, 3],
    [2, 3],
    [3, 3],
  ]);
  expect(result).toMatchObject({
    ok: true,
    value: {
      evaluations: [20, 20, 250],
      moves: [
        { ply: 1, grade: "Best", side: "white" },
        { ply: 2, grade: "Mistake", side: "black", bestSan: "c5" },
      ],
    },
  });
});

it("rejects a report that would publish an illegal engine move", async () => {
  const stockfish = engine();
  stockfish.analyze.mockReset().mockResolvedValueOnce(
    ok({
      candidates: [
        {
          uci: "a1a8",
          evaluationCpFromSideToMove: 20,
          depth: 13,
          principalVariation: ["a1a8"],
        },
      ],
    }),
  );
  expect(
    await analyzeGameReport(game(), stockfish, new AbortController().signal),
  ).toMatchObject({ ok: false });
});

it("stops searching when the player leaves the report", async () => {
  const request = new AbortController();
  const stockfish = engine();
  const result = await analyzeGameReport(
    game(),
    stockfish,
    request.signal,
    () => {
      request.abort();
    },
  );
  expect(result.ok).toBe(false);
  expect(stockfish.analyze).toHaveBeenCalledTimes(1);
});
