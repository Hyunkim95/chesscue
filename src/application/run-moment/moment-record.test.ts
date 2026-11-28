import { expect, it } from "vitest";

import { dayRecap, deriveProgress } from "../../domain/progress";
import { forkObservation } from "../../domain/progress/test-fixtures";
import { pickToday } from "../../domain/session/today";
import { momentRecord } from "./moment-record";

it("moves on after a player completes a threat spot without playing a move", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  const threat = forkObservation(
    "retry",
    "2026-11-26T10:01:00Z",
    "threat-game",
  );
  const next = forkObservation("retry", "2026-11-24T10:01:00Z", "next-game");
  const record = momentRecord({
    id: "completed-threat",
    result: {
      outcome: "spotted",
      helped: false,
      attempts: [],
      explorations: 0,
    },
    source: { kind: "game", gameId: threat.game.id, ply: threat.ply },
    unitId: "hanging-piece",
    completedAt: now,
  });
  expect(record).toMatchObject({ firstMoveUci: "", outcome: "spotted" });
  expect(record).not.toHaveProperty("unitId");
  if (!record) throw new Error("Expected a completed threat spot");
  expect(
    pickToday({
      puzzles: [],
      stars: new Map(),
      moments: [next, threat],
      attempts: [record],
      alwaysServe: (moment) => moment === threat,
      now: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    }),
  ).toEqual({ kind: "new", moment: next });

  const progressInput = {
    now,
    timeZone: "UTC",
    attempts: [record],
    games: [],
    curriculum: [],
  };
  const progress = deriveProgress(progressInput);
  expect(progress.dailyGoal.done).toBe(1);
  expect(progress.stars.size).toBe(0);
  expect(progress.achievements).not.toContain("first-idea");
  expect(dayRecap(progressInput).ideasSpotted).toBe(0);
});
