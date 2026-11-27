import { expect, test } from "vitest";
import { attemptRecord, forkObservation } from "./test-fixtures";
import type { ProgressInput } from "./types";
import { unitHistory } from "./unit-history";

const input = {
  attempts: [],
  games: [],
  curriculum: [],
  now: new Date("2026-11-27T12:00:00Z"),
  timeZone: "Asia/Dubai",
} satisfies ProgressInput;

test("returns newest-first attempt and real-game evidence for just this idea", () => {
  const puzzle = { kind: "puzzle", puzzleId: "fork" } as const;
  const attempts = Object.freeze([
    attemptRecord({ completedAt: "2026-11-25T18:00:00+04:00", source: puzzle }),
    attemptRecord({ completedAt: "2026-11-25T16:00:00Z", outcome: "shown" }),
    attemptRecord({ unitId: "simple-mates" }),
    attemptRecord({
      completedAt: "2026-11-25T11:00:00Z",
      outcome: "found-on-retry",
      source: puzzle,
    }),
  ]);
  const games = Object.freeze([
    forkObservation("retry", "2026-11-25T12:00:00Z", "missed-game"),
    forkObservation("matched", "2026-11-25T15:00:00Z", "played-game"),
  ]);

  expect(unitHistory({ ...input, attempts, games }, "double-attack")).toEqual([
    {
      kind: "missed",
      at: "2026-11-25T16:00:00Z",
      source: { kind: "game", gameId: "game-1", ply: 35 },
    },
    {
      kind: "played",
      at: "2026-11-25T15:00:00Z",
      source: { kind: "game", gameId: "played-game", ply: 1 },
    },
    { kind: "spotted", at: "2026-11-25T18:00:00+04:00", source: puzzle },
    {
      kind: "missed",
      at: "2026-11-25T12:00:00Z",
      source: { kind: "game", gameId: "missed-game", ply: 1 },
    },
    { kind: "missed", at: "2026-11-25T11:00:00Z", source: puzzle },
  ]);
});

test("returns an empty history when the idea has no evidence", () => {
  expect(
    unitHistory(
      { ...input, games: [forkObservation("matched")] },
      "simple-mates",
    ),
  ).toEqual([]);
});
