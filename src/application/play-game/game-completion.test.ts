import { describe, expect, it, vi } from "vitest";

import type { GameId, GameRecord, GameResult } from "../../domain/game/types";
import { OneShotGameCompletionObserver } from "./game-completion";

const gameId = (value: string): GameId => value as GameId;

const completedRecord = (id: string, result: GameResult): GameRecord => ({
  schemaVersion: 1,
  id: gameId(id),
  origin: { type: "tutor" },
  initialFen: "initial-fen",
  moves: [],
  pgn: "pgn",
  playerColor: "white",
  result,
  createdAt: "2026-11-24T12:00:00Z",
  completedAt: "2026-11-24T12:05:00Z",
  curriculumVersion: "1.0.0",
  configurationVersion: "1.0.0",
  fingerprint: null,
});

describe("OneShotGameCompletionObserver", () => {
  it.each([
    ["checkmate", "white-win"],
    ["draw", "draw"],
    ["resignation", "black-win"],
  ] as const)("notifies once for a durable %s result", (_label, result) => {
    const callback = vi.fn();
    const observer = new OneShotGameCompletionObserver(callback);
    const record = completedRecord(`game-${result}`, result);

    observer.notify(record);
    observer.notify(record);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(record);
  });

  it("does not notify for an in-progress record", () => {
    const callback = vi.fn();
    const observer = new OneShotGameCompletionObserver(callback);
    const record = {
      ...completedRecord("game-active", "draw"),
      completedAt: null,
      result: null,
    };

    observer.notify(record);

    expect(callback).not.toHaveBeenCalled();
  });

  it("isolates synchronous and asynchronous callback failures", async () => {
    const synchronous = new OneShotGameCompletionObserver(() => {
      throw new Error("callback failed");
    });
    const asynchronous = new OneShotGameCompletionObserver(() =>
      Promise.reject(new Error("callback failed")),
    );

    expect(() => {
      synchronous.notify(completedRecord("game-sync", "draw"));
    }).not.toThrow();
    asynchronous.notify(completedRecord("game-async", "draw"));
    await Promise.resolve();
  });
});
