import { describe, expect, it, vi } from "vitest";

import type { PositionId } from "../../domain/game/types";
import { StockfishGameEngine } from "./stockfish-game-engine";

class FakeWorker {
  public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  public onerror: ((event: ErrorEvent) => void) | null = null;
  public readonly messages: string[] = [];
  public terminated = false;

  public postMessage(message: string): void {
    this.messages.push(message);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emit(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

const positionId = (value: string): PositionId => value as PositionId;

describe("StockfishGameEngine", () => {
  it("completes the UCI readiness handshake", async () => {
    const worker = new FakeWorker();
    const engine = new StockfishGameEngine({ createWorker: () => worker });
    const initialized = engine.initialize(new AbortController().signal);

    expect(worker.messages).toEqual(["uci"]);
    worker.emit("uciok");
    expect(worker.messages).toEqual(["uci", "isready"]);
    worker.emit("readyok");

    await expect(initialized).resolves.toEqual({ ok: true, value: undefined });
  });

  it("sets bounded strength and resolves a best move", async () => {
    const worker = new FakeWorker();
    const engine = new StockfishGameEngine({ createWorker: () => worker });
    const initialized = engine.initialize(new AbortController().signal);
    worker.emit("uciok");
    worker.emit("readyok");
    await initialized;

    const result = engine.chooseMove({
      positionId: positionId("position-1"),
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      moves: ["e2e4"],
      targetElo: 900,
      timeBudgetMs: 1000,
      signal: new AbortController().signal,
    });

    expect(worker.messages).toContain("setoption name UCI_Elo value 1320");
    expect(worker.messages).toContain("go movetime 1000");
    worker.emit("bestmove e7e5");

    await expect(result).resolves.toEqual({ ok: true, value: { uci: "e7e5" } });
    engine.dispose();
  });

  it("restricts an opening search to validated policy candidates", async () => {
    const worker = new FakeWorker();
    const engine = new StockfishGameEngine({ createWorker: () => worker });
    const initialized = engine.initialize(new AbortController().signal);
    worker.emit("uciok");
    worker.emit("readyok");
    await initialized;

    const result = engine.chooseMove({
      positionId: positionId("position-opening"),
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      moves: ["e2e4"],
      targetElo: 1480,
      timeBudgetMs: 1000,
      searchMoves: ["e7e5", "c7c5", "invalid", "e7e5"],
      signal: new AbortController().signal,
    });

    expect(worker.messages).toContain("go searchmoves e7e5 c7c5 movetime 1000");
    worker.emit("bestmove e7e5");
    await expect(result).resolves.toEqual({
      ok: true,
      value: { uci: "e7e5" },
    });
    engine.dispose();
  });

  it("cancels a pending search and ignores a late best move", async () => {
    const worker = new FakeWorker();
    const engine = new StockfishGameEngine({ createWorker: () => worker });
    const initialized = engine.initialize(new AbortController().signal);
    worker.emit("uciok");
    worker.emit("readyok");
    await initialized;
    const abort = new AbortController();
    const result = engine.chooseMove({
      positionId: positionId("position-2"),
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      moves: ["e2e4"],
      targetElo: 1480,
      timeBudgetMs: 1000,
      signal: abort.signal,
    });

    abort.abort();
    worker.emit("bestmove e7e5");

    await expect(result).resolves.toEqual({
      ok: false,
      error: { code: "cancelled" },
    });
    expect(worker.messages).toContain("stop");
    engine.dispose();
  });

  it("stops and times out a search within the hard ceiling", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const engine = new StockfishGameEngine({ createWorker: () => worker });
    const initialized = engine.initialize(new AbortController().signal);
    worker.emit("uciok");
    worker.emit("readyok");
    await initialized;
    const result = engine.chooseMove({
      positionId: positionId("position-3"),
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      moves: ["e2e4"],
      targetElo: 1480,
      timeBudgetMs: 4750,
      signal: new AbortController().signal,
    });

    await vi.advanceTimersByTimeAsync(5000);

    await expect(result).resolves.toEqual({
      ok: false,
      error: { code: "timeout" },
    });
    expect(worker.messages).toContain("stop");
    engine.dispose();
    vi.useRealTimers();
  });
});
