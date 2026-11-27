import { expect, it } from "vitest";

import { earnedAchievements } from "./achievements";
import { gameIdeaEvidence } from "./game-evidence";
import { deriveStars } from "./stars";
import { forkObservation, mateDefenceObservation } from "./test-fixtures";

it("reads a missed fork and a played fork from real games", () => {
  expect(
    gameIdeaEvidence([forkObservation("retry"), forkObservation("matched")]),
  ).toMatchObject([
    { unitId: "double-attack", outcome: "missed" },
    { unitId: "double-attack", outcome: "played" },
  ]);
});

it("counts a threat dealt with as seeing the threat in a real game", () => {
  const games = [mateDefenceObservation()];
  expect(gameIdeaEvidence(games)).toMatchObject([
    { unitId: "see-the-threat", outcome: "played", ply: 1 },
  ]);
  // Derived, never stored: the star shines and "Played it" is earned.
  const { stars } = deriveStars({
    attempts: [],
    games,
    curriculum: [],
    now: new Date("2026-11-28T10:00:00Z"),
    timeZone: "Asia/Dubai",
  });
  expect(stars.get("see-the-threat")).toBe("shining");
  expect(
    earnedAchievements({ attempts: [], stars, streakBest: 0, curriculum: [] }),
  ).toContain("played-it");
});
