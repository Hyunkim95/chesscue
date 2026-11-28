import { describe, expect, it } from "vitest";

import { achievementCopy, lockedAchievements } from "./achievement-copy";

const titles = {
  unitTitles: new Map([["back-rank", "Back rank"]]),
  stageTitles: new Map([["play-safely", "Play safely"]]),
};

describe("achievementCopy", () => {
  it("names a first-unit achievement after the unit", () => {
    expect(achievementCopy("first-unit:back-rank", titles)).toEqual({
      title: "First back rank",
      description: "Spotted unaided",
      glyph: "♞",
    });
  });

  it("names a full constellation after its stage", () => {
    expect(achievementCopy("full-constellation:play-safely", titles)).toEqual({
      title: "Play safely",
      description: "Every star lit",
      glyph: "✶",
    });
  });

  it("falls back to generic copy for an unknown unit or stage", () => {
    expect(achievementCopy("first-unit:skewer", titles).title).toBe(
      "A new idea",
    );
    expect(achievementCopy("full-constellation:endgames", titles).title).toBe(
      "Full constellation",
    );
  });

  it("has a title, line and glyph for every fixed achievement", () => {
    for (const id of [
      "first-idea",
      "played-it",
      "week-one",
      "collector",
      "night-owl",
    ] as const) {
      const copy = achievementCopy(id, titles);
      expect(copy.title).not.toBe("");
      expect(copy.description).not.toBe("");
      expect(copy.glyph).not.toBe("");
    }
  });
});

describe("lockedAchievements", () => {
  it("lists the fixed achievements and one constellation per stage, minus earned ones", () => {
    expect(
      lockedAchievements(
        ["first-idea", "first-unit:fork", "full-constellation:a"],
        ["a", "b"],
      ),
    ).toEqual([
      "played-it",
      "week-one",
      "collector",
      "night-owl",
      "full-constellation:b",
    ]);
  });

  it("never lists first-unit achievements", () => {
    expect(
      lockedAchievements([], []).some((id) => id.startsWith("first-unit:")),
    ).toBe(false);
  });
});
