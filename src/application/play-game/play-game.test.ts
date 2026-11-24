import { describe, expect, it } from "vitest";

import type { EngineMoveRequest, GameEngine } from "../ports/game-engine";
import type { GameRepository } from "../ports/game-repository";
import type { GameId, GameRecord, PositionId } from "../../domain/game/types";
import type { Result } from "../../shared/result/result";
import { ok } from "../../shared/result/result";
import {
  acceptPlayerMove,
  requestCpuReply,
  resignTutorGame,
  startTutorGame,
} from "./play-game";

class RecordingRepository implements GameRepository {
  public readonly writes: GameRecord[] = [];

  public async get(): Promise<Result<GameRecord | null, never>> {
    return Promise.resolve(ok(null));
  }

  public async put(record: GameRecord): Promise<Result<void, never>> {
    this.writes.push(record);
    return Promise.resolve(ok(undefined));
  }

  public async listCompleted(): Promise<Result<readonly GameRecord[], never>> {
    return Promise.resolve(ok([]));
  }
}

class FixedEngine implements GameEngine {
  public request: EngineMoveRequest | null = null;
  public disposed = false;

  public initialize(): Promise<Result<void, never>> {
    return Promise.resolve(ok(undefined));
  }

  public chooseMove(
    request: EngineMoveRequest,
  ): Promise<Result<{ readonly uci: string }, never>> {
    this.request = request;
    return Promise.resolve(ok({ uci: "e7e5" }));
  }

  public dispose(): void {
    this.disposed = true;
  }
}

const gameId = (value: string): GameId => value as GameId;
const positionId = (value: string): PositionId => value as PositionId;

describe("play game application", () => {
  it("durably stores the player move before requesting the CPU move", async () => {
    const repository = new RecordingRepository();
    const started = await startTutorGame({
      id: gameId("game-1"),
      playerColor: "white",
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      now: "2026-11-24T12:00:00Z",
      repository,
    });
    if (!started.ok) throw new Error("Expected the game to start");

    const playerTurn = await acceptPlayerMove({
      session: started.value,
      move: { from: "e2", to: "e4" },
      now: "2026-11-24T12:00:01Z",
      repository,
    });

    expect(playerTurn.ok).toBe(true);
    expect(repository.writes).toHaveLength(2);
    expect(repository.writes[1]?.moves[0]?.uci).toBe("e2e4");
  });

  it("requests and persists a legal CPU response", async () => {
    const repository = new RecordingRepository();
    const engine = new FixedEngine();
    const started = await startTutorGame({
      id: gameId("game-2"),
      playerColor: "white",
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      now: "2026-11-24T12:00:00Z",
      repository,
    });
    if (!started.ok) throw new Error("Expected the game to start");
    const playerTurn = await acceptPlayerMove({
      session: started.value,
      move: { from: "e2", to: "e4" },
      now: "2026-11-24T12:00:01Z",
      repository,
    });
    if (!playerTurn.ok) throw new Error("Expected a legal player turn");

    const cpuTurn = await requestCpuReply({
      session: playerTurn.value,
      engine,
      repository,
      positionId: positionId("position-2"),
      targetElo: 1480,
      timeBudgetMs: 1200,
      now: () => "2026-11-24T12:00:02Z",
      signal: new AbortController().signal,
    });

    expect(cpuTurn.ok).toBe(true);
    expect(engine.request?.fen).toBe(playerTurn.value.state.fen);
    expect(repository.writes.at(-1)?.moves.map(({ uci }) => uci)).toEqual([
      "e2e4",
      "e7e5",
    ]);
  });

  it("persists resignation as a completed loss", async () => {
    const repository = new RecordingRepository();
    const started = await startTutorGame({
      id: gameId("game-3"),
      playerColor: "white",
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      now: "2026-11-24T12:00:00Z",
      repository,
    });
    if (!started.ok) throw new Error("Expected the game to start");

    const resigned = await resignTutorGame({
      session: started.value,
      now: "2026-11-24T12:00:03Z",
      repository,
    });

    expect(resigned.ok).toBe(true);
    if (resigned.ok) {
      expect(resigned.value.record.result).toBe("black-win");
      expect(resigned.value.record.completedAt).toBe("2026-11-24T12:00:03Z");
    }
  });
});
