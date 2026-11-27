import { expect, test } from "vitest";

import {
  followUpAttempt,
  followUpExercise,
  followUpPackSchema,
  followUpSet,
  identificationRate,
  type FollowUpPack,
} from "./follow-up-puzzles";

const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const puzzle = (id: string, unitId: string) => ({
  id,
  unitId,
  fen: start,
  solution: ["e2e4", "e7e5"],
  rating: 1400,
  source: "https://lichess.org/abcdefgh",
});
const pack: FollowUpPack = {
  schemaVersion: 1,
  source: "test",
  engine: "test",
  puzzles: [
    puzzle("f1", "double-attack"),
    puzzle("f2", "double-attack"),
    puzzle("p1", "line-tactics"),
    puzzle("m1", "mating-patterns"),
  ],
};

test("pairs an unseen same-idea puzzle with a different idea", () => {
  const set = followUpSet(pack, "double-attack", new Set(["f1"]), "seed");
  expect(set).toHaveLength(2);
  expect(set?.find((item) => item.sameIdea)?.puzzle.id).toBe("f2");
  expect(set?.find((item) => !item.sameIdea)?.puzzle.unitId).not.toBe(
    "double-attack",
  );
});

test("varies which puzzle comes first, the same way for the same seed", () => {
  const firsts = new Set(
    ["a", "b", "c", "d", "e", "f"].map(
      (seed) =>
        followUpSet(pack, "double-attack", new Set(), seed)?.[0]?.sameIdea,
    ),
  );
  expect(firsts).toEqual(new Set([true, false]));
  expect(followUpSet(pack, "double-attack", new Set(), "x")).toEqual(
    followUpSet(pack, "double-attack", new Set(), "x"),
  );
});

test("offers nothing once every same-idea puzzle has been seen", () => {
  expect(
    followUpSet(pack, "double-attack", new Set(["f1", "f2"]), "seed"),
  ).toBeUndefined();
});

test("counts only unhelped first-move solves of the same idea", () => {
  const [same, other] = [
    { puzzle: puzzle("f1", "double-attack"), sameIdea: true },
    { puzzle: puzzle("p1", "line-tactics"), sameIdea: false },
  ];
  const attempts = [
    followUpAttempt(same, "e2e4", false),
    followUpAttempt(same, "e2e4", true),
    followUpAttempt(same, "d2d4", false),
    followUpAttempt(other, "e2e4", false),
  ];
  expect(identificationRate(attempts)).toEqual({ solved: 1, attempts: 3 });
});

test("hides the idea in the practice exercise", () => {
  const exercise = followUpExercise(puzzle("f1", "double-attack"));
  expect(exercise.theme).toBe("other");
  expect(exercise.acceptableMoves).toEqual(["e2e4"]);
});

test("rejects a pack with an illegal solution or duplicate ids", () => {
  expect(
    followUpPackSchema.safeParse({
      ...pack,
      puzzles: [puzzle("x", "a"), { ...puzzle("y", "b"), solution: ["e2e5"] }],
    }).success,
  ).toBe(false);
  expect(
    followUpPackSchema.safeParse({
      ...pack,
      puzzles: [puzzle("x", "a"), puzzle("x", "b")],
    }).success,
  ).toBe(false);
});

test("the installed pack parses and has 30 puzzles for every tactic unit", async () => {
  const { default: material } =
    await import("../../../scripts/material/follow-up-puzzles.generated.json");
  const parsed = followUpPackSchema.parse(material);
  const perUnit = new Map<string, number>();
  for (const { unitId } of parsed.puzzles)
    perUnit.set(unitId, (perUnit.get(unitId) ?? 0) + 1);
  expect(perUnit.size).toBe(8);
  expect(new Set(perUnit.values())).toEqual(new Set([30]));
});
