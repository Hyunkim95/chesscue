import { describe, expect, it } from "vitest";

import { earnedAchievements, type AchievementInput } from "./achievements";
import { attemptRecord } from "./test-fixtures";
import type { MomentAttemptRecord, StarState } from "./types";

function input(overrides: Partial<AchievementInput> = {}): AchievementInput {
  return {
    attempts: [],
    stars: new Map(),
    streakBest: 0,
    curriculum: [],
    ...overrides,
  };
}

function stars(entries: Record<string, StarState>): Map<string, StarState> {
  return new Map(Object.entries(entries));
}

function litStars(count: number, state: StarState): Map<string, StarState> {
  return new Map(
    Array.from({ length: count }, (_, i) => [`unit-${String(i)}`, state]),
  );
}

describe("earnedAchievements", () => {
  it("earns nothing from no evidence", () => {
    expect(earnedAchievements(input())).toEqual([]);
  });

  it("earns first-idea and first-unit only from spotted records", () => {
    const attempts = [
      attemptRecord({ outcome: "found-on-retry", unitId: "pin" }),
      attemptRecord({ outcome: "shown", unitId: "skewer" }),
    ];
    expect(earnedAchievements(input({ attempts }))).toEqual([]);
  });

  it("earns first-idea without a unit when the record has none", () => {
    const puzzle: MomentAttemptRecord = {
      schemaVersion: 1,
      id: "puzzle-attempt",
      source: { kind: "puzzle", puzzleId: "0Uxzm" },
      firstMoveUci: "f3g5",
      tiers: ["best"],
      outcome: "spotted",
      helped: false,
      explorations: 1,
      completedAt: "2026-11-27T09:00:00.000Z",
    };
    expect(earnedAchievements(input({ attempts: [puzzle] }))).toEqual([
      "first-idea",
    ]);
  });

  it("earns one first-unit per unit, at its first spotted record", () => {
    const attempts = [
      attemptRecord({ unitId: "pin", completedAt: "2026-11-27T11:00:00Z" }),
      attemptRecord({
        unitId: "double-attack",
        completedAt: "2026-11-27T09:00:00Z",
      }),
      attemptRecord({ unitId: "pin", completedAt: "2026-11-27T10:00:00Z" }),
      attemptRecord({
        unitId: "double-attack",
        completedAt: "2026-11-27T12:00:00Z",
      }),
    ];
    expect(earnedAchievements(input({ attempts }))).toEqual([
      "first-idea",
      "first-unit:double-attack",
      "first-unit:pin",
    ]);
  });

  it("orders timed achievements by instant, not by the text of the timestamp", () => {
    const attempts = [
      attemptRecord({ unitId: "pin", completedAt: "2026-11-27T09:00:00Z" }),
      // 08:30 UTC, earlier than the record above.
      attemptRecord({
        unitId: "skewer",
        completedAt: "2026-11-27T12:30:00+04:00",
      }),
    ];
    expect(earnedAchievements(input({ attempts }))).toEqual([
      "first-idea",
      "first-unit:skewer",
      "first-unit:pin",
    ]);
  });

  it("breaks ties in time by achievement id", () => {
    const completedAt = "2026-11-27T09:00:00Z";
    const attempts = [
      attemptRecord({ unitId: "skewer", completedAt }),
      attemptRecord({ unitId: "pin", completedAt }),
    ];
    expect(earnedAchievements(input({ attempts }))).toEqual([
      "first-idea",
      "first-unit:pin",
      "first-unit:skewer",
    ]);
  });

  it("earns played-it when any star is shining", () => {
    expect(
      earnedAchievements(input({ stars: stars({ pin: "spotted" }) })),
    ).toEqual([]);
    expect(
      earnedAchievements(input({ stars: stars({ pin: "shining" }) })),
    ).toEqual(["played-it"]);
  });

  it("earns week-one from a best streak of seven days", () => {
    expect(earnedAchievements(input({ streakBest: 6 }))).toEqual([]);
    expect(earnedAchievements(input({ streakBest: 7 }))).toEqual(["week-one"]);
  });

  it("earns collector from ten spotted or shining stars", () => {
    const nine = litStars(9, "spotted");
    expect(
      earnedAchievements(
        input({ stars: new Map([...nine, ["missed-unit", "missed"]]) }),
      ),
    ).toEqual([]);
    expect(
      earnedAchievements(
        input({ stars: new Map([...nine, ["last", "spotted"]]) }),
      ),
    ).toEqual(["collector"]);
    expect(
      earnedAchievements(input({ stars: litStars(10, "shining") })),
    ).toEqual(["played-it", "collector"]);
  });

  it("earns full-constellation when every unit of a stage is lit", () => {
    const curriculum = [
      { stageId: "stage-2", unitIds: ["pin", "skewer"] },
      { stageId: "stage-1", unitIds: ["double-attack"] },
      { stageId: "stage-3", unitIds: ["pin", "deflection"] },
    ];
    const lit = stars({
      pin: "spotted",
      skewer: "spotted",
      "double-attack": "spotted",
      deflection: "missed",
    });
    expect(earnedAchievements(input({ stars: lit, curriculum }))).toEqual([
      "full-constellation:stage-2",
      "full-constellation:stage-1",
    ]);
  });

  it("does not earn full-constellation for an empty stage", () => {
    expect(
      earnedAchievements(
        input({ curriculum: [{ stageId: "empty", unitIds: [] }] }),
      ),
    ).toEqual([]);
  });

  it("lists a repeated stage once", () => {
    const stage = { stageId: "stage-1", unitIds: ["pin"] };
    expect(
      earnedAchievements(
        input({
          stars: stars({ pin: "spotted" }),
          curriculum: [stage, stage],
        }),
      ),
    ).toEqual(["full-constellation:stage-1"]);
  });

  it("earns night-owl at the third position within 30-minute gaps", () => {
    const attempts = [
      attemptRecord({ outcome: "shown", completedAt: "2026-11-27T22:00:00Z" }),
      attemptRecord({ outcome: "shown", completedAt: "2026-11-27T22:30:00Z" }),
      attemptRecord({ outcome: "shown", completedAt: "2026-11-27T23:00:00Z" }),
    ];
    expect(earnedAchievements(input({ attempts }))).toEqual(["night-owl"]);
  });

  it("does not earn night-owl when a gap exceeds 30 minutes", () => {
    const attempts = [
      attemptRecord({ outcome: "shown", completedAt: "2026-11-27T22:00:00Z" }),
      attemptRecord({ outcome: "shown", completedAt: "2026-11-27T22:20:00Z" }),
      attemptRecord({ outcome: "shown", completedAt: "2026-11-27T22:50:01Z" }),
      attemptRecord({ outcome: "shown", completedAt: "2026-11-27T23:15:00Z" }),
    ];
    expect(earnedAchievements(input({ attempts }))).toEqual([]);
  });

  it("dates night-owl by its third position among other timed achievements", () => {
    const attempts = [
      attemptRecord({
        outcome: "shown",
        unitId: "pin",
        completedAt: "2026-11-27T09:20:00Z",
      }),
      attemptRecord({
        outcome: "found-on-retry",
        unitId: "pin",
        completedAt: "2026-11-27T09:00:00Z",
      }),
      attemptRecord({ unitId: "pin", completedAt: "2026-11-27T09:40:00Z" }),
      attemptRecord({ unitId: "skewer", completedAt: "2026-11-27T08:00:00Z" }),
    ];
    // Sorted: 08:00 skewer, 09:00, 09:20, 09:40 pin. Night owl completes at
    // 09:40 with first-unit:pin; "first-unit:pin" sorts before "night-owl".
    expect(earnedAchievements(input({ attempts }))).toEqual([
      "first-idea",
      "first-unit:skewer",
      "first-unit:pin",
      "night-owl",
    ]);
  });

  it("puts timed achievements first, then the fixed untimed order, without duplicates", () => {
    const attempts = [
      attemptRecord({ unitId: "pin", completedAt: "2026-11-20T09:00:00Z" }),
      attemptRecord({ unitId: "pin", completedAt: "2026-11-21T09:00:00Z" }),
      attemptRecord({ unitId: "pin", completedAt: "2026-11-21T09:10:00Z" }),
      attemptRecord({ unitId: "pin", completedAt: "2026-11-21T09:20:00Z" }),
      attemptRecord({ unitId: "pin", completedAt: "2026-11-21T09:30:00Z" }),
    ];
    const lit = new Map<string, StarState>([
      ...litStars(10, "spotted"),
      ["pin", "shining"],
    ]);
    const result = earnedAchievements({
      attempts,
      stars: lit,
      streakBest: 12,
      curriculum: [
        { stageId: "stage-b", unitIds: ["pin"] },
        { stageId: "stage-a", unitIds: ["unit-0", "unit-1"] },
      ],
    });
    expect(result).toEqual([
      "first-idea",
      "first-unit:pin",
      "night-owl",
      "played-it",
      "week-one",
      "collector",
      "full-constellation:stage-b",
      "full-constellation:stage-a",
    ]);
    expect(new Set(result).size).toBe(result.length);
  });
});
