import { expect, it } from "vitest";

import { ok } from "../../shared/result/result";
import type {
  AnalysisEngine,
  AnalyzePositionRequest,
} from "../analyze-game/analysis-engine";
import { checkTry, type MomentPosition } from "./check-try";
import { momentRecord } from "./moment-record";

const FORK: MomentPosition = {
  fen: "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35",
  bestUci: "f3g5",
  bestCp: 723,
  solutionLine: ["f3g5", "f7f6", "g5e6"],
};

function engine(reply: string, cpForRook: number) {
  const requests: AnalyzePositionRequest[] = [];
  const fake: AnalysisEngine = {
    initialize: () => Promise.resolve(ok(undefined)),
    analyze: (request) => {
      requests.push(request);
      return Promise.resolve(
        ok({
          candidates: [
            {
              uci: reply,
              evaluationCpFromSideToMove: cpForRook,
              principalVariation: [reply],
              depth: 14,
            },
          ],
        }),
      );
    },
    dispose: () => undefined,
  };
  return { fake, requests };
}

const signal = new AbortController().signal;

it("accepts the best move without a search and answers with the line", async () => {
  const { fake, requests } = engine("a1a1", 0);
  const result = await checkTry({
    position: FORK,
    uci: "f3g5",
    engine: fake,
    signal,
  });
  expect(requests).toHaveLength(0);
  expect(result).toMatchObject({
    ok: true,
    value: {
      attempt: { san: "Nxg5+", tier: "best", replyUci: "f7f6" },
      replySan: "Kf6",
    },
  });
});

it("rates a level miss and plays Rook's reply from Stockfish", async () => {
  const { fake } = engine("f7g8", 60);
  const result = await checkTry({
    position: FORK,
    uci: "g3f4",
    engine: fake,
    signal,
  });
  expect(result).toMatchObject({
    ok: true,
    value: {
      attempt: { san: "gxf4", tier: "missed", replyUci: "f7g8" },
      playedCp: -60,
    },
  });
});

it("rates a move that loses material as costly", async () => {
  const { fake } = engine("b5c5", 520);
  const result = await checkTry({
    position: FORK,
    uci: "c3b3",
    engine: fake,
    signal,
  });
  expect(result.ok && result.value.attempt.tier).toBe("costly");
});

it("refuses an illegal move", async () => {
  const { fake } = engine("a1a1", 0);
  expect(
    await checkTry({ position: FORK, uci: "a1a8", engine: fake, signal }),
  ).toMatchObject({ ok: false, error: { code: "illegal" } });
});

it("builds a record from a finished session", () => {
  expect(
    momentRecord({
      id: "m1",
      result: {
        outcome: "found-on-retry",
        helped: false,
        explorations: 3,
        attempts: [
          { uci: "g3f4", san: "gxf4", tier: "missed" },
          { uci: "f3g5", san: "Nxg5+", tier: "best" },
        ],
      },
      source: { kind: "game", gameId: "g", ply: 35 },
      unitId: "double-attack",
      completedAt: new Date("2026-11-27T10:00:00Z"),
    }),
  ).toEqual({
    schemaVersion: 1,
    id: "m1",
    source: { kind: "game", gameId: "g", ply: 35 },
    unitId: "double-attack",
    firstMoveUci: "g3f4",
    tiers: ["missed", "best"],
    outcome: "found-on-retry",
    helped: false,
    explorations: 3,
    completedAt: "2026-11-27T10:00:00.000Z",
  });
});
