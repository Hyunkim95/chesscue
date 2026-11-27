import { describe, expect, it, vi } from "vitest";

import * as achievements from "./achievements";
import * as collection from "./collection";
import { deriveProgress } from "./index";
import { attemptRecord, forkObservation } from "./test-fixtures";
import type { ProgressInput } from "./types";

function progressInput(overrides: Partial<ProgressInput> = {}): ProgressInput {
  return {
    attempts: [],
    games: [],
    curriculum: [{ stageId: "tactics", unitIds: ["double-attack", "pin"] }],
    now: new Date("2026-11-27T12:00:00Z"),
    timeZone: "UTC",
    ...overrides,
  };
}

describe("deriveProgress", () => {
  it("defaults to level one, an empty sky, and no counted days", () => {
    const progress = deriveProgress(progressInput());

    expect(progress).toMatchObject({
      xp: 0,
      level: 1,
      streak: { current: 0, best: 0 },
      dailyGoal: { done: 0, target: 3 },
      newestStar: undefined,
    });
    expect(progress.stars.size).toBe(0);
    expect(progress.week).toHaveLength(7);
    expect(progress.week.every(({ done }) => !done)).toBe(true);
  });

  it.each([
    { outcome: "spotted", explorations: 0, xp: 25 },
    { outcome: "found-on-retry", explorations: 0, xp: 15 },
    { outcome: "shown", explorations: 0, xp: 0 },
    { outcome: "shown", explorations: 4, xp: 8 },
    { outcome: "spotted", explorations: 20, xp: 35 },
  ] as const)(
    "awards $xp XP for $outcome with $explorations explorations",
    ({ outcome, explorations, xp }) => {
      const attempts = [attemptRecord({ outcome, explorations })];
      expect(deriveProgress(progressInput({ attempts })).xp).toBe(xp);
    },
  );

  it("levels up at exactly 100 XP and counts every completion toward the goal", () => {
    const attempts = Array.from({ length: 4 }, () =>
      attemptRecord({ explorations: 0 }),
    );
    const before = deriveProgress(
      progressInput({ attempts: attempts.slice(1) }),
    );
    const after = deriveProgress(progressInput({ attempts }));

    expect(before).toMatchObject({ xp: 75, level: 1 });
    expect(after).toMatchObject({
      xp: 100,
      level: 2,
      streak: { current: 1, best: 1 },
      dailyGoal: { done: 4, target: 3 },
    });
  });

  it("counts completions by local date and lists the seven days oldest first", () => {
    const input = progressInput({
      attempts: [
        attemptRecord({
          completedAt: "2026-11-26T23:30:00Z",
          outcome: "shown",
        }),
        attemptRecord({ completedAt: "2026-11-26T19:59:00Z" }),
        attemptRecord({ completedAt: "2026-11-20T23:30:00Z" }),
      ],
    });
    const dubai = deriveProgress({ ...input, timeZone: "Asia/Dubai" });

    expect(deriveProgress(input).dailyGoal.done).toBe(0);
    expect(dubai.dailyGoal.done).toBe(1);
    expect(dubai.streak).toEqual({ current: 2, best: 2 });
    expect(dubai.week).toEqual([
      { date: "2026-11-21", done: true },
      { date: "2026-11-22", done: false },
      { date: "2026-11-23", done: false },
      { date: "2026-11-24", done: false },
      { date: "2026-11-25", done: false },
      { date: "2026-11-26", done: true },
      { date: "2026-11-27", done: true },
    ]);
  });

  it("keeps the streak alive through yesterday and preserves the best after a break", () => {
    const input = progressInput({
      attempts: ["26", "23", "22", "25", "21"].map((day) =>
        attemptRecord({ completedAt: `2026-11-${day}T12:00:00Z` }),
      ),
    });

    expect(deriveProgress(input).streak).toEqual({ current: 2, best: 3 });
    expect(
      deriveProgress({ ...input, now: new Date("2026-11-28T12:00:00Z") })
        .streak,
    ).toEqual({ current: 0, best: 3 });
  });

  it("counts consecutive calendar days across a daylight saving transition", () => {
    const input = progressInput({
      now: new Date("2026-03-10T03:58:00Z"),
      timeZone: "America/New_York",
      attempts: [
        attemptRecord({ completedAt: "2026-03-08T04:59:00Z" }),
        attemptRecord({ completedAt: "2026-03-09T03:59:00Z" }),
        attemptRecord({ completedAt: "2026-03-10T03:57:00Z" }),
      ],
    });

    expect(deriveProgress(input).streak).toEqual({ current: 3, best: 3 });
  });

  it("derives only evidenced stars, with shining above spotted above missed", () => {
    const { unitId, ...unnamedAttempt } = attemptRecord({ unitId: "unseen" });
    const input = progressInput({
      attempts: [
        attemptRecord(),
        attemptRecord({ unitId: "pin" }),
        attemptRecord({ unitId: "pin", outcome: "found-on-retry" }),
        attemptRecord({ unitId: "skewer", outcome: "found-on-retry" }),
        attemptRecord({ unitId: "discovery", outcome: "shown" }),
        unnamedAttempt,
      ],
      games: [forkObservation("retry"), forkObservation("matched")],
    });

    const { stars } = deriveProgress(input);
    expect(stars.get(unitId ?? "")).toBeUndefined();
    expect(stars).toEqual(
      new Map([
        ["double-attack", "shining"],
        ["pin", "spotted"],
        ["skewer", "missed"],
        ["discovery", "missed"],
      ]),
    );
    expect(
      deriveProgress({
        ...input,
        attempts: [],
        games: [forkObservation("retry")],
      }).stars.get("double-attack"),
    ).toBe("missed");
  });

  it("makes a promotion newer than the star's original discovery", () => {
    const input = progressInput({
      attempts: [
        attemptRecord({ completedAt: "2026-11-24T09:00:00Z" }),
        attemptRecord({ unitId: "pin", completedAt: "2026-11-26T09:00:00Z" }),
      ],
      games: [forkObservation("matched", "2026-11-27T09:00:00Z")],
    });

    expect(deriveProgress(input).newestStar).toBe("double-attack");
  });

  it("selects the latest first attainment of a current state and breaks ties by unit ID", () => {
    const input = progressInput({
      attempts: [
        attemptRecord({
          unitId: "pin",
          outcome: "shown",
          completedAt: "2026-11-24T09:00:00Z",
        }),
        attemptRecord({
          unitId: "pin",
          completedAt: "2026-11-26T13:00:00+04:00",
        }),
        attemptRecord({
          unitId: "battery",
          completedAt: "2026-11-26T09:00:00Z",
        }),
        attemptRecord({ unitId: "pin", completedAt: "2026-11-27T10:00:00Z" }),
        attemptRecord({
          unitId: "skewer",
          completedAt: "2026-11-24T09:00:00Z",
        }),
        attemptRecord({
          unitId: "skewer",
          completedAt: "2026-11-27T11:00:00Z",
        }),
        attemptRecord({ completedAt: "2026-11-27T09:00:00Z" }),
      ],
      games: [
        forkObservation("matched", "2026-11-25T10:00:00Z"),
        forkObservation("matched", "2026-11-27T11:00:00Z", "another-fork"),
      ],
    });

    const progress = deriveProgress(input);
    expect(progress.newestStar).toBe("battery");
    expect(deriveProgress(input)).toEqual(progress);
    expect(
      deriveProgress({
        ...input,
        attempts: [...input.attempts].reverse(),
        games: [...input.games].reverse(),
      }).newestStar,
    ).toBe("battery");
  });

  it("passes the derived evidence to achievements and the idea collection", () => {
    const earned = vi
      .spyOn(achievements, "earnedAchievements")
      .mockReturnValue(["first-idea"]);
    const collect = vi
      .spyOn(collection, "ideaCollection")
      .mockReturnValue([{ unitId: "double-attack", level: 1 }]);
    try {
      const input = progressInput({ attempts: [attemptRecord()] });
      const progress = deriveProgress(input);

      expect(earned).toHaveBeenCalledWith({
        attempts: input.attempts,
        stars: progress.stars,
        streakBest: 1,
        curriculum: input.curriculum,
      });
      expect(collect).toHaveBeenCalledWith({
        attempts: input.attempts,
        games: input.games,
        stars: progress.stars,
      });
      expect(progress.achievements).toEqual(["first-idea"]);
      expect(progress.ideas).toEqual([{ unitId: "double-attack", level: 1 }]);
    } finally {
      earned.mockRestore();
      collect.mockRestore();
    }
  });
});
