import { expect, it } from "vitest";

import type { MomentAttemptRecord, StarState } from "../progress/types";
import { recommendedPuzzles } from "./recommended-puzzles";

const puzzle = (id: string, unitId: string, rating: number) => ({
  id,
  unitId,
  rating,
});
const PUZZLES = [
  puzzle("fork-hard", "double-attack", 1700),
  puzzle("mate-easy", "simple-mates", 900),
  puzzle("fork-easy", "double-attack", 1200),
  puzzle("pin-mid", "line-tactics", 1300),
  puzzle("fork-mid", "double-attack", 1400),
];
const tried = (puzzleId: string): MomentAttemptRecord => ({
  schemaVersion: 1,
  id: `a-${puzzleId}`,
  source: { kind: "puzzle", puzzleId },
  firstMoveUci: "e2e4",
  tiers: ["best"],
  outcome: "spotted",
  helped: false,
  explorations: 0,
  completedAt: "2026-11-27T10:00:00Z",
});
const none = new Map<string, StarState>();

it("recommends unseen puzzles from the missed units, easiest first", () => {
  expect(
    recommendedPuzzles({
      puzzles: PUZZLES,
      attempts: [tried("fork-easy")],
      stars: new Map([["double-attack", "missed"]]),
    }).map(({ id }) => id),
  ).toEqual(["fork-mid", "fork-hard", "mate-easy"]);
});

it("gives a new player the easiest puzzles", () => {
  expect(
    recommendedPuzzles({ puzzles: PUZZLES, attempts: [], stars: none }).map(
      ({ id }) => id,
    ),
  ).toEqual(["mate-easy", "fork-easy", "pin-mid"]);
});

it("never repeats today's own position", () => {
  expect(
    recommendedPuzzles({
      puzzles: PUZZLES,
      attempts: [],
      stars: none,
      exclude: "mate-easy",
    }).map(({ id }) => id),
  ).toEqual(["fork-easy", "pin-mid", "fork-mid"]);
});

it("shows fewer when few are left", () => {
  expect(
    recommendedPuzzles({
      puzzles: PUZZLES,
      attempts: PUZZLES.slice(1).map(({ id }) => tried(id)),
      stars: none,
    }).map(({ id }) => id),
  ).toEqual(["fork-hard"]);
});
