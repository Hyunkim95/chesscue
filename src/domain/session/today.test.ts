import { expect, it } from "vitest";

import { attemptRecord, forkObservation } from "../progress/test-fixtures";
import { pickToday, type TodayInput } from "./today";

const now = new Date("2026-11-27T12:00:00Z");
const empty: TodayInput = {
  moments: [],
  attempts: [],
  puzzles: [],
  stars: new Map(),
  now,
};

it("offers a warm-up to a new player", () => {
  expect(pickToday(empty)).toEqual({ kind: "warm-up" });
});

it("picks a new moment from the player's games first", () => {
  const moment = forkObservation("retry");
  expect(pickToday({ ...empty, moments: [moment] })).toEqual({
    kind: "new",
    moment,
  });
});

it("brings a missed moment back after a day, but not a spotted one", () => {
  const moment = forkObservation("retry");
  const source = {
    kind: "game",
    gameId: moment.game.id,
    ply: moment.ply,
  } as const;
  const yesterday = "2026-11-26T09:00:00Z";
  expect(
    pickToday({
      ...empty,
      moments: [moment],
      attempts: [
        attemptRecord({ source, outcome: "shown", completedAt: yesterday }),
      ],
    }),
  ).toEqual({ kind: "returning", moment });
  expect(
    pickToday({
      ...empty,
      moments: [moment],
      attempts: [
        attemptRecord({ source, outcome: "spotted", completedAt: yesterday }),
      ],
    }),
  ).toEqual({ kind: "caught-up" });
  expect(
    pickToday({
      ...empty,
      moments: [moment],
      attempts: [
        attemptRecord({
          source,
          outcome: "shown",
          completedAt: "2026-11-27T10:00:00Z",
        }),
      ],
    }),
  ).toEqual({ kind: "caught-up" });
});

it("falls back to an unplayed puzzle like the player's misses", () => {
  expect(
    pickToday({
      ...empty,
      attempts: [attemptRecord({ outcome: "shown" })],
      stars: new Map([["double-attack", "missed"]]),
      puzzles: [
        { id: "p1", unitId: "pins" },
        { id: "p2", unitId: "double-attack" },
      ],
    }),
  ).toEqual({ kind: "similar", puzzleId: "p2" });
});
