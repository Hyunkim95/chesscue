import { expect, it, vi } from "vitest";

import type { ObservedMove } from "../curriculum/game-drill";
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

// The Two Knights after 4. Ng5, Black to move: a quiet position whose best
// move is d5. `secondCp` is the second-best move's evaluation.
function planMoment(secondCp: number): ObservedMove {
  const base = forkObservation("retry", "2026-11-26T10:01:00Z", "plan-game");
  const { exercise } = base.drill;
  return {
    ...base,
    drill: {
      ...base.drill,
      exercise: {
        ...exercise,
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4",
        verification: {
          ...exercise.verification,
          principalVariation: ["d7d5", "e4d5", "c6a5"],
          candidates: [
            { uci: "d7d5", evaluationCp: -10 },
            { uci: "f8c5", evaluationCp: secondCp },
          ],
        },
      },
    },
  };
}

it("skips a plan position with several good moves for the next candidate", () => {
  const fork = forkObservation("retry");
  const unclear = planMoment(-40);
  expect(pickToday({ ...empty, moments: [unclear, fork] })).toEqual({
    kind: "new",
    moment: fork,
  });
  // Nothing else to offer: the player has games, so they are caught up.
  expect(pickToday({ ...empty, moments: [unclear] })).toEqual({
    kind: "caught-up",
  });
  const clear = planMoment(-113);
  expect(pickToday({ ...empty, moments: [clear, fork] })).toEqual({
    kind: "new",
    moment: clear,
  });
});

// The fork moment with other scores: `bestCp` for the best move and the
// played move `impactCp` below it, both for the player.
function scoredMoment(bestCp: number, impactCp: number): ObservedMove {
  const base = forkObservation("retry", "2026-11-26T10:01:00Z", "scored");
  const { exercise } = base.drill;
  const [best, ...rest] = exercise.verification.candidates;
  if (!best) throw new Error("The fork fixture has no best move.");
  return {
    ...base,
    impactCp,
    drill: {
      ...base.drill,
      exercise: {
        ...exercise,
        verification: {
          ...exercise.verification,
          candidates: [
            { ...best, evaluationCp: bestCp },
            ...rest.map((move) => ({
              ...move,
              evaluationCp: bestCp - impactCp,
            })),
          ],
        },
      },
    },
  };
}

it("skips a moment whose result was decided whatever the player played", () => {
  const lost = scoredMoment(-718, 71);
  const won = scoredMoment(900, 200);
  for (const decided of [lost, won]) {
    expect(
      pickToday({ ...empty, moments: [decided], alwaysServe: () => true }),
    ).toEqual({ kind: "caught-up" });
  }
  const level = scoredMoment(0, 80);
  expect(pickToday({ ...empty, moments: [level] })).toEqual({
    kind: "new",
    moment: level,
  });
});

it("serves a moment the app always serves, such as Spot the danger", () => {
  const unclear = planMoment(-40);
  expect(
    pickToday({ ...empty, moments: [unclear], alwaysServe: () => true }),
  ).toEqual({ kind: "new", moment: unclear });
});

it("checks the special format only for an eligible candidate that needs it", () => {
  const newest = forkObservation("retry", "2026-11-27T10:01:00Z", "seen");
  const next = forkObservation("retry", "2026-11-27T09:01:00Z");
  const alwaysServe = vi.fn(() => false);

  expect(
    pickToday({
      ...empty,
      moments: [planMoment(-40), next, newest],
      attempts: [
        attemptRecord({
          source: { kind: "game", gameId: newest.game.id, ply: newest.ply },
          outcome: "spotted",
        }),
      ],
      alwaysServe,
    }),
  ).toEqual({ kind: "new", moment: next });
  expect(alwaysServe).not.toHaveBeenCalled();
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

it("never offers a chance taken as new, but brings one missed in a replay back", () => {
  const chance = forkObservation("matched");
  const source = {
    kind: "game",
    gameId: chance.game.id,
    ply: chance.ply,
  } as const;
  expect(pickToday({ ...empty, chancesTaken: [chance] })).not.toMatchObject({
    moment: chance,
  });
  const missed = attemptRecord({
    source,
    outcome: "shown",
    completedAt: "2026-11-26T09:00:00Z",
  });
  expect(
    pickToday({ ...empty, chancesTaken: [chance], attempts: [missed] }),
  ).toEqual({ kind: "returning", moment: chance });
  // Tried less than a day ago, or spotted: not yet, or not again.
  expect(
    pickToday({
      ...empty,
      chancesTaken: [chance],
      attempts: [{ ...missed, completedAt: "2026-11-27T09:00:00Z" }],
    }),
  ).toEqual({ kind: "caught-up" });
  expect(
    pickToday({
      ...empty,
      chancesTaken: [chance],
      attempts: [{ ...missed, outcome: "spotted" }],
    }),
  ).toEqual({ kind: "caught-up" });
});
