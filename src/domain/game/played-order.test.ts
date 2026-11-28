import { expect, test } from "vitest";

import { playedOrder } from "./played-order";
import { createGameId, type GameRecord } from "./types";

const base: GameRecord = {
  schemaVersion: 1,
  id: createGameId("g"),
  origin: { type: "pgn-paste" },
  initialFen: "start",
  moves: [],
  pgn: "",
  playerColor: "white",
  result: "white-win",
  createdAt: "2026-11-28T10:00:00.000Z",
  completedAt: "2026-11-28T10:00:00.000Z",
  curriculumVersion: "1.0.0",
  configurationVersion: "1.0.0",
  fingerprint: null,
};

test("orders an imported game by when it was played, not imported", () => {
  const pgn = (tags: string) => tags + "\n\n1. e4 1-0";
  expect(
    playedOrder({
      ...base,
      pgn: pgn('[UTCDate "2024.03.05"]\n[UTCTime "18:30:00"]'),
    }),
  ).toBe(Date.parse("2024-03-05T18:30:00Z"));
  expect(playedOrder({ ...base, pgn: pgn('[Date "2023.01.02"]') })).toBe(
    Date.parse("2023-01-02"),
  );
  expect(playedOrder({ ...base, pgn: pgn('[Date "????.??.??"]') })).toBe(
    Date.parse(base.completedAt ?? ""),
  );
});

test("orders a game played here by when it finished, and skips unfinished ones", () => {
  const played: GameRecord = {
    ...base,
    origin: { type: "tutor", opponentElo: 800 },
    pgn: '[Date "2001.01.01"]\n\n1. e4 1-0',
  };
  expect(playedOrder(played)).toBe(Date.parse(base.completedAt ?? ""));
  expect(playedOrder({ ...base, completedAt: null, result: null })).toBeNull();
});
