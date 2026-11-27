import { expect, it } from "vitest";
import { firstCrossing, raceProgress } from "./elo-race";
import { createGameId } from "../game/types";
import type { RatingEntry } from "../game/rating";
const join = "2026-01-02T00:00:00.000Z";
const day = (n: number) => new Date(Date.UTC(2026, 0, n)).toISOString();
const entry = (n: number, before: number, after: number): RatingEntry => ({
  gameId: createGameId(String(n)),
  completedAt: day(n),
  before,
  after,
  result: before < after ? "Won" : "Lost",
  opponentElo: 1450,
  beginner: false,
});
it("preserves the first crossing after a loss and replays a late loss ahead of it", () => {
  const member = { startingElo: 1450, joinedAt: join },
    goal = { kind: "gain", value: 10 } as const;
  expect(
    raceProgress(
      [entry(1, 1440, 1450), entry(4, 1450, 1466), entry(5, 1466, 1450)],
      member,
      goal,
    ),
  ).toEqual({ target: 1460, baseline: 1450, current: 1450, crossedAt: day(4) });
  expect(
    raceProgress(
      [entry(1, 1440, 1450), entry(3, 1450, 1434), entry(4, 1434, 1451)],
      member,
      goal,
    ).crossedAt,
  ).toBeNull();
});
it("uses the first published rating after placement and counts subsequent games", () => {
  const member = { startingElo: null, joinedAt: join },
    goal = { kind: "milestone", value: 1510 } as const;
  const placed = [
    { ...entry(3, 1400, 1480), placementGame: 4 },
    { ...entry(4, 1480, 1500), placementGame: 5 },
  ];
  expect(raceProgress(placed.slice(0, 1), member, goal).current).toBeNull();
  expect(
    raceProgress(placed, member, { kind: "milestone", value: 1490 }).crossedAt,
  ).toBeNull();
  expect(raceProgress([...placed, entry(5, 1500, 1510)], member, goal)).toEqual(
    { target: 1510, baseline: 1500, current: 1510, crossedAt: day(5) },
  );
});

it("awards equal recorded times joint first and withholds a disputed placing", () => {
  const early = { crossedAt: day(3), disputed: false },
    late = { crossedAt: day(4), disputed: false };
  for (const standings of [
    [early, early, late],
    [late, early, early],
  ]) {
    expect(
      standings.filter((m) => m.crossedAt === firstCrossing(standings)),
    ).toHaveLength(2);
  }
  expect(firstCrossing([{ ...early, disputed: true }, late])).toBeNull();
});

it("keeps the highest Elo held since joining through later losses", () => {
  const member = { startingElo: 1450, joinedAt: join };
  const goal = { kind: "highest" } as const;
  const history = [
    entry(1, 1600, 1580),
    entry(2, 1580, 1450),
    entry(3, 1450, 1470),
    entry(4, 1470, 1420),
  ];
  expect(raceProgress(history.slice(0, 2), member, goal)).toHaveProperty(
    "peak",
    1450,
  );
  expect(raceProgress(history, member, goal)).toMatchObject({
    peak: 1470,
    current: 1420,
    crossedAt: null,
    target: null,
  });
});

it("starts counting at the first published rating for a player in placement", () => {
  const member = { startingElo: null, joinedAt: join };
  const goal = { kind: "highest" } as const;
  const provisional = { ...entry(3, 1700, 1730), placementGame: 4 };
  const published = { ...entry(4, 1730, 1600), placementGame: 5 };
  expect(raceProgress([provisional], member, goal)).toHaveProperty(
    "peak",
    null,
  );
  expect(
    raceProgress([provisional, published, entry(5, 1600, 1550)], member, goal),
  ).toHaveProperty("peak", 1600);
});
