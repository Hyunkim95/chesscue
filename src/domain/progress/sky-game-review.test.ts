import { expect, it } from "vitest";
import { summarizeSkyGames } from "./sky-game-review";
import {
  attemptRecord,
  forkObservation,
  mateDefenceObservation,
} from "./test-fixtures";

const curriculum = [
  { stageId: "vision", unitIds: ["double-attack", "see-the-threat"] },
];

it("finds a real-game strength and a repeat miss with a position still to solve", () => {
  const first = forkObservation("retry", "2026-11-25T10:01:00Z", "first");
  const second = forkObservation("retry", "2026-11-26T10:01:00Z", "second");
  const solved = attemptRecord({
    source: { kind: "game", gameId: "second", ply: 1 },
  });
  const shown = attemptRecord({
    source: { kind: "game", gameId: "first", ply: 1 },
    outcome: "shown",
  });

  expect(
    summarizeSkyGames({
      games: [second, first, first, mateDefenceObservation()],
      attempts: [solved, shown],
      curriculum,
    }),
  ).toEqual({
    strength: { unitId: "see-the-threat", games: 1 },
    focus: {
      unitId: "double-attack",
      games: 2,
      retry: { kind: "game", gameId: "first", ply: 1 },
    },
  });
});

it("keeps practice-only wins out of the game summary", () => {
  expect(
    summarizeSkyGames({ games: [], attempts: [attemptRecord()], curriculum }),
  ).toEqual({
    strength: undefined,
    focus: undefined,
  });
});
