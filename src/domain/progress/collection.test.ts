import { describe, expect, it } from "vitest";

import { ideaCollection } from "./collection";
import { forkObservation } from "./test-fixtures";
import type { StarState } from "./types";

function stars(entries: Record<string, StarState>): Map<string, StarState> {
  return new Map(Object.entries(entries));
}

const played = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    forkObservation(
      "matched",
      `2026-11-2${String(i)}T10:00:00Z`,
      `fork-game-${String(i)}`,
    ),
  );

describe("ideaCollection", () => {
  it("is empty without lit stars", () => {
    expect(
      ideaCollection({ attempts: [], games: [], stars: new Map() }),
    ).toEqual([]);
    expect(
      ideaCollection({
        attempts: [],
        games: [forkObservation("retry")],
        stars: stars({ "double-attack": "missed", pin: "not-seen" }),
      }),
    ).toEqual([]);
  });

  it("gives a spotted idea level 1", () => {
    expect(
      ideaCollection({
        attempts: [],
        games: [],
        stars: stars({ pin: "spotted" }),
      }),
    ).toEqual([{ unitId: "pin", level: 1 }]);
  });

  it("gives a shining idea level 2 for its first real-game play", () => {
    expect(
      ideaCollection({
        attempts: [],
        games: played(1),
        stars: stars({ "double-attack": "shining" }),
      }),
    ).toEqual([{ unitId: "double-attack", level: 2 }]);
  });

  it("adds a level for each further unaided play, ignoring misses", () => {
    expect(
      ideaCollection({
        attempts: [],
        games: [
          ...played(3),
          forkObservation("retry", "2026-11-26T10:00:00Z", "missed-game"),
        ],
        stars: stars({ "double-attack": "shining" }),
      }),
    ).toEqual([{ unitId: "double-attack", level: 4 }]);
  });

  it("counts plays only for their own unit", () => {
    expect(
      ideaCollection({
        attempts: [],
        games: played(3),
        stars: stars({ "double-attack": "spotted", pin: "shining" }),
      }),
    ).toEqual([
      { unitId: "double-attack", level: 1 },
      { unitId: "pin", level: 2 },
    ]);
  });

  it("orders cards by unit id", () => {
    expect(
      ideaCollection({
        attempts: [],
        games: [],
        stars: stars({
          skewer: "spotted",
          "double-attack": "spotted",
          pin: "missed",
          deflection: "spotted",
        }),
      }).map(({ unitId }) => unitId),
    ).toEqual(["deflection", "double-attack", "skewer"]);
  });
});
