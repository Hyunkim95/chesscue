import { describe, expect, it } from "vitest";

import { workerRequestSchema, workerResponseSchema } from "./protocol";

describe("worker protocol", () => {
  it("accepts a bounded search request", () => {
    const result = workerRequestSchema.safeParse({
      type: "search",
      requestId: "request-1",
      protocolVersion: 1,
      positionId: "position-1",
      fen: "startpos",
      moves: [],
      targetElo: 1200,
      timeBudgetMs: 2000,
    });

    expect(result.success).toBe(true);
  });

  it("rejects engine moves that are not UCI moves", () => {
    const result = workerResponseSchema.safeParse({
      type: "best-move",
      requestId: "request-1",
      protocolVersion: 1,
      positionId: "position-1",
      uci: "knight to f3",
    });

    expect(result.success).toBe(false);
  });
});
