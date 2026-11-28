import { describe, expect, it, vi } from "vitest";

import { StockfishAnalysisEngine } from "./stockfish-analysis-engine";

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

async function readyEngine(worker: FakeWorker, maximumSearchTimeMs = 2_000) {
  const engine = new StockfishAnalysisEngine({
    createWorker: () => worker,
    maximumSearchTimeMs,
  });
  const initialized = engine.initialize(new AbortController().signal);
  worker.emit("uciok");
  worker.emit("readyok");
  await initialized;
  return engine;
}

describe("StockfishAnalysisEngine", () => {
  it("collects the deepest MultiPV score and principal variation", async () => {
    const worker = new FakeWorker();
    const engine = await readyEngine(worker);
    const result = engine.analyze({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      timeBudgetMs: 100,
      multiPv: 2,
      signal: new AbortController().signal,
    });

    worker.emit("info depth 8 multipv 1 score cp 20 nodes 100 pv e2e4 e7e5");
    worker.emit("info depth 10 multipv 1 score cp 31 nodes 200 pv d2d4 d7d5");
    worker.emit("info depth 10 multipv 2 score cp 18 nodes 180 pv g1f3 d7d5");
    worker.emit("bestmove d2d4");

    await expect(result).resolves.toEqual({
      ok: true,
      value: {
        candidates: [
          {
            uci: "d2d4",
            evaluationCpFromSideToMove: 31,
            principalVariation: ["d2d4", "d7d5"],
            depth: 10,
          },
          {
            uci: "g1f3",
            evaluationCpFromSideToMove: 18,
            principalVariation: ["g1f3", "d7d5"],
            depth: 10,
          },
        ],
      },
    });
    engine.dispose();
  });

  it("reports each depth once every line has reached it", async () => {
    const worker = new FakeWorker();
    const engine = await readyEngine(worker);
    const progress: number[][] = [];
    const result = engine.analyze({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      timeBudgetMs: 100,
      multiPv: 2,
      signal: new AbortController().signal,
      onProgress: ({ candidates }) => {
        progress.push(candidates.map(({ depth }) => depth));
      },
    });

    worker.emit("info depth 9 multipv 1 score cp 20 pv e2e4 e7e5");
    worker.emit("info depth 9 multipv 2 score cp 18 pv d2d4 d7d5");
    worker.emit("info depth 10 multipv 1 score cp 25 pv e2e4 e7e5");
    expect(progress).toEqual([[9], [9, 9]]);
    worker.emit("info depth 10 multipv 2 score cp 19 pv d2d4 d7d5");
    worker.emit("bestmove e2e4");
    await result;

    expect(progress).toEqual([[9], [9, 9], [10, 10]]);
    engine.dispose();
  });

  it("searches a fixed depth from a cleared hash when asked", async () => {
    const worker = new FakeWorker();
    const engine = await readyEngine(worker);
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const result = engine.analyze({
      fen,
      timeBudgetMs: 2_000,
      depth: 16,
      multiPv: 1,
      signal: new AbortController().signal,
    });
    worker.emit("info depth 16 multipv 1 score cp 20 pv e2e4 e7e5");
    worker.emit("bestmove e2e4");
    await result;

    expect(worker.messages.slice(-3)).toEqual([
      "ucinewgame",
      "position fen " + fen,
      "go depth 16 movetime 2000",
    ]);
    engine.dispose();
  });

  it("normalizes mate scores to bounded centipawns", async () => {
    const worker = new FakeWorker();
    const engine = await readyEngine(worker);
    const result = engine.analyze({
      fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
      timeBudgetMs: 100,
      multiPv: 1,
      signal: new AbortController().signal,
    });

    worker.emit("info depth 4 multipv 1 score mate 1 pv f7g7");
    worker.emit("bestmove f7g7");

    await expect(result).resolves.toMatchObject({
      ok: true,
      value: { candidates: [{ evaluationCpFromSideToMove: 99_999 }] },
    });
    engine.dispose();
  });

  it("bounds principal variations to the persisted schema limit", async () => {
    const worker = new FakeWorker();
    const engine = await readyEngine(worker);
    const result = engine.analyze({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      timeBudgetMs: 100,
      multiPv: 1,
      signal: new AbortController().signal,
    });
    const longLine = Array.from({ length: 25 }, () => "e2e4").join(" ");

    worker.emit(`info depth 10 multipv 1 score cp 20 pv ${longLine}`);
    worker.emit("bestmove e2e4");

    const settled = await result;
    expect(settled.ok).toBe(true);
    if (settled.ok) {
      expect(settled.value.candidates[0]?.principalVariation).toHaveLength(20);
    }
    engine.dispose();
  });

  it("cancels analysis and ignores late worker output", async () => {
    const worker = new FakeWorker();
    const engine = await readyEngine(worker);
    const abort = new AbortController();
    const result = engine.analyze({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      timeBudgetMs: 100,
      multiPv: 1,
      signal: abort.signal,
    });

    abort.abort();
    worker.emit("info depth 10 score cp 20 pv e2e4 e7e5");
    worker.emit("bestmove e2e4");

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });
    expect(worker.messages).toContain("stop");
    expect(worker.terminated).toBe(true);
  });

  it("stops at the budget and fails after the hard grace period", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const engine = await readyEngine(worker, 100);
    const result = engine.analyze({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      timeBudgetMs: 500,
      multiPv: 1,
      signal: new AbortController().signal,
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(worker.messages).toContain("stop");
    await vi.advanceTimersByTimeAsync(250);

    await expect(result).resolves.toMatchObject({
      ok: false,
      error: { code: "timeout" },
    });
    expect(worker.terminated).toBe(true);
    vi.useRealTimers();
  });
});
