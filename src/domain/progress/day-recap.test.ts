import { describe, expect, it } from "vitest";

import { dayRecap } from "./index";
import { attemptRecord, forkObservation } from "./test-fixtures";
import type { ProgressInput } from "./types";

const input: ProgressInput = {
  attempts: [],
  games: [],
  curriculum: [],
  now: new Date("2026-11-27T00:00:00Z"),
  timeZone: "Asia/Dubai",
};

describe("dayRecap", () => {
  it("counts today's spotted positions and XP from all of today's completions", () => {
    const history: ProgressInput = {
      ...input,
      attempts: [
        attemptRecord({
          unitId: "pin",
          outcome: "shown",
          completedAt: "2026-11-26T19:59:00Z",
        }),
        attemptRecord({ unitId: "pin", completedAt: "2026-11-26T23:30:00Z" }),
        attemptRecord({ unitId: "pin", completedAt: "2026-11-26T23:40:00Z" }),
        attemptRecord({
          unitId: "skewer",
          outcome: "found-on-retry",
          completedAt: "2026-11-26T23:45:00Z",
        }),
        attemptRecord({
          unitId: "battery",
          outcome: "shown",
          explorations: 9,
          completedAt: "2026-11-26T23:50:00Z",
        }),
      ],
      games: [forkObservation("matched", "2026-11-26T23:55:00Z")],
    };
    const recap = {
      ideasSpotted: 2,
      streak: 2,
      xpToday: 81,
      newIdeas: ["double-attack", "pin"],
    };

    expect(dayRecap(history)).toEqual(recap);
    expect(dayRecap(history)).toEqual(recap);
  });

  it("does not count today's promotion if the star was already lit yesterday", () => {
    expect(
      dayRecap({
        ...input,
        attempts: [attemptRecord({ completedAt: "2026-11-26T19:59:00Z" })],
        games: [forkObservation("matched", "2026-11-26T23:30:00Z")],
      }),
    ).toEqual({ ideasSpotted: 0, streak: 1, xpToday: 0, newIdeas: [] });
  });

  it("does not count a spotted attempt as a new idea after an earlier shining star", () => {
    expect(
      dayRecap({
        ...input,
        attempts: [attemptRecord({ completedAt: "2026-11-26T23:30:00Z" })],
        games: [forkObservation("matched", "2026-11-26T19:59:00Z")],
      }),
    ).toEqual({ ideasSpotted: 1, streak: 1, xpToday: 27, newIdeas: [] });
  });

  it("does not use games alone for streak or XP", () => {
    expect(
      dayRecap({
        ...input,
        games: [forkObservation("matched", "2026-11-26T23:30:00Z")],
      }),
    ).toEqual({
      ideasSpotted: 0,
      streak: 0,
      xpToday: 0,
      newIdeas: ["double-attack"],
    });
  });
});
