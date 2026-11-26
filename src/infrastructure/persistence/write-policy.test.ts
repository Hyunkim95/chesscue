import { describe, expect, it } from "vitest";

import type { GameId, GameRecord, RecordedMove } from "../../domain/game/types";

import { decideGameWrite } from "./write-policy";

const move = (ply: number): RecordedMove => ({
  ply,
  san: ply === 1 ? "e4" : "e5",
  uci: ply === 1 ? "e2e4" : "e7e5",
  fenAfter: `fen-${String(ply)}`,
  playedAt: `2026-11-24T12:00:0${String(ply)}.000Z`,
});

const game = (overrides: Partial<GameRecord> = {}): GameRecord => ({
  schemaVersion: 1,
  id: "game-1" as GameId,
  origin: { type: "tutor" },
  initialFen: "start",
  moves: [move(1)],
  pgn: "1. e4",
  playerColor: "white",
  result: null,
  createdAt: "2026-11-24T12:00:00.000Z",
  completedAt: null,
  curriculumVersion: "1.0.0",
  configurationVersion: "1.0.0",
  fingerprint: null,
  ...overrides,
});

describe("game write policy", () => {
  it("inserts a new game", () => {
    expect(decideGameWrite(undefined, game())).toEqual({ type: "insert" });
  });

  it("allows an in-progress append without rewriting history", () => {
    const existing = game();
    const incoming = game({ moves: [move(1), move(2)], pgn: "1. e4 e5" });

    expect(decideGameWrite(existing, incoming)).toEqual({
      type: "replace-in-progress",
    });
  });

  it("rejects rewriting a persisted move", () => {
    const existing = game();
    const incoming = game({ moves: [{ ...move(1), uci: "d2d4" }] });

    expect(decideGameWrite(existing, incoming)).toEqual({
      type: "conflict",
      reason: "An in-progress update cannot rewrite persisted move history.",
    });
  });

  it("keeps completed games immutable", () => {
    const existing = game({
      completedAt: "2026-11-24T12:05:00.000Z",
      result: "white-win",
    });
    const incoming = game({
      completedAt: "2026-11-24T12:05:00.000Z",
      result: "draw",
    });

    expect(decideGameWrite(existing, incoming)).toEqual({
      type: "conflict",
      reason: "Completed games are immutable and cannot be replaced.",
    });
  });

  it("allows Coach to join at the current ply once and preserves the marker", () => {
    const rated = game({
      origin: { type: "tutor", mode: "rated", opponentElo: 1450 },
    });
    const withCoach = { ...rated, coachJoinedAtPly: rated.moves.length };
    expect(decideGameWrite(rated, withCoach)).toEqual({
      type: "replace-in-progress",
    });
    expect(
      decideGameWrite(rated, { ...withCoach, coachJoinedAtPly: 0 }),
    ).toMatchObject({ type: "conflict" });
    expect(decideGameWrite(withCoach, rated)).toMatchObject({
      type: "conflict",
    });
    expect(
      decideGameWrite(withCoach, { ...withCoach, moves: [move(1), move(2)] }),
    ).toEqual({ type: "replace-in-progress" });
  });

  it("accepts an idempotent completed-game write", () => {
    const completed = game({
      completedAt: "2026-11-24T12:05:00.000Z",
      result: "white-win",
    });
    expect(decideGameWrite(completed, structuredClone(completed))).toEqual({
      type: "idempotent",
    });
  });
});
