import { describe, expect, it, vi } from "vitest";

import type { EngineMoveRequest, GameEngine } from "../ports/game-engine";
import type {
  GameRepository,
  RepositoryFailure,
} from "../ports/game-repository";
import type { GameId, GameRecord, PositionId } from "../../domain/game/types";
import type { Result } from "../../shared/result/result";
import { err, ok } from "../../shared/result/result";
import { OneShotGameCompletionObserver } from "./game-completion";
import {
  acceptPlayerMove,
  requestCpuReply,
  resignTutorGame,
  startTutorGame,
} from "./play-game";

class RecordingRepository implements GameRepository {
  public readonly writes: GameRecord[] = [];

  public constructor(private readonly events: string[] = []) {}

  public async get(): Promise<Result<GameRecord | null, never>> {
    return Promise.resolve(ok(null));
  }

  public async put(record: GameRecord): Promise<Result<void, never>> {
    this.writes.push(record);
    this.events.push(`put:${record.result ?? "active"}`);
    return Promise.resolve(ok(undefined));
  }

  public async listCompleted(): Promise<Result<readonly GameRecord[], never>> {
    return Promise.resolve(ok([]));
  }
}

class FailOnTerminalRepository implements GameRepository {
  public get(): Promise<Result<GameRecord | null, never>> {
    return Promise.resolve(ok(null));
  }

  public put(record: GameRecord): Promise<Result<void, RepositoryFailure>> {
    return record.completedAt === null
      ? Promise.resolve(ok(undefined))
      : Promise.resolve(
          err({ code: "unavailable", message: "terminal write failed" }),
        );
  }

  public listCompleted(): Promise<Result<readonly GameRecord[], never>> {
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

  it("forwards bounded opening candidates without bypassing Stockfish", async () => {
    const repository = new RecordingRepository();
    const engine = new FixedEngine();
    const started = await startTutorGame({
      id: gameId("game-opening-policy"),
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

    await requestCpuReply({
      session: playerTurn.value,
      engine,
      repository,
      positionId: positionId("position-opening-policy"),
      targetElo: 1480,
      timeBudgetMs: 1200,
      searchMoves: ["e7e5", "c7c5"],
      now: () => "2026-11-24T12:00:02Z",
      signal: new AbortController().signal,
    });

    expect(engine.request?.searchMoves).toEqual(["e7e5", "c7c5"]);
  });

  it("persists resignation as a completed loss", async () => {
    const events: string[] = [];
    const repository = new RecordingRepository(events);
    const callback = vi.fn((record: GameRecord) => {
      events.push(`callback:${record.result ?? "active"}`);
    });
    const completionObserver = new OneShotGameCompletionObserver(callback);
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
      completionObserver,
    });

    expect(resigned.ok).toBe(true);
    if (resigned.ok) {
      expect(resigned.value.record.result).toBe("black-win");
      expect(resigned.value.record.completedAt).toBe("2026-11-24T12:00:03Z");
      expect(callback).toHaveBeenCalledTimes(1);
      expect(events.slice(-2)).toEqual(["put:black-win", "callback:black-win"]);
    }
  });

  it.each([
    {
      label: "checkmate",
      fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
      move: { from: "f7", to: "g7" } as const,
      result: "white-win",
    },
    {
      label: "draw",
      fen: "7k/8/8/8/8/8/1n6/K1B5 w - - 0 1",
      move: { from: "c1", to: "b2" } as const,
      result: "draw",
    },
  ] as const)(
    "notifies after a locally durable $label",
    async ({ fen, move, result }) => {
      const repository = new RecordingRepository();
      const callback = vi.fn();
      const completionObserver = new OneShotGameCompletionObserver(callback);
      const started = await startTutorGame({
        id: gameId(`game-${result}`),
        playerColor: "white",
        curriculumVersion: "1.0.0",
        configurationVersion: "1.0.0",
        now: "2026-11-24T12:00:00Z",
        repository,
        initialFen: fen,
      });
      if (!started.ok) throw new Error("Expected the game to start");

      const completed = await acceptPlayerMove({
        session: started.value,
        move,
        now: "2026-11-24T12:00:01Z",
        repository,
        completionObserver,
      });

      expect(completed.ok).toBe(true);
      expect(repository.writes.at(-1)?.result).toBe(result);
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );

  it("does not notify when the terminal record fails to persist", async () => {
    const repository = new FailOnTerminalRepository();
    const callback = vi.fn();
    const completionObserver = new OneShotGameCompletionObserver(callback);
    const started = await startTutorGame({
      id: gameId("game-write-failure"),
      playerColor: "white",
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      now: "2026-11-24T12:00:00Z",
      repository,
    });
    if (!started.ok) throw new Error("Expected the game to start");

    const resigned = await resignTutorGame({
      session: started.value,
      now: "2026-11-24T12:00:01Z",
      repository,
      completionObserver,
    });

    expect(resigned.ok).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });
});
