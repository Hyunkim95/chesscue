import type {
  AnalysisCandidate,
  AnalysisEngine,
  AnalysisEngineFailure,
  AnalyzePositionRequest,
  PositionAnalysis,
} from "../../application/analyze-game/analysis-engine";
import type { Result } from "../../shared/result/result";
import { err, ok } from "../../shared/result/result";

interface AnalysisWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: string): void;
  terminate(): void;
}

export interface StockfishAnalysisEngineOptions {
  readonly assetUrl?: string;
  readonly createWorker?: (assetUrl: string) => AnalysisWorkerLike;
  readonly initializationTimeoutMs?: number;
  readonly maximumSearchTimeMs?: number;
}

interface PendingInitialization {
  readonly resolve: (result: Result<void, AnalysisEngineFailure>) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
}

interface PendingAnalysis {
  readonly resolve: (
    result: Result<PositionAnalysis, AnalysisEngineFailure>,
  ) => void;
  readonly stopTimer: ReturnType<typeof setTimeout>;
  readonly failureTimer: ReturnType<typeof setTimeout>;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
  readonly candidates: Map<number, AnalysisCandidate>;
}

const DEFAULT_ASSET_URL = "/stockfish/stockfish-19-lite-single.js";

function mateToCentipawns(mate: number): number {
  if (mate === 0) return 0;
  const distancePenalty = Math.min(Math.abs(mate), 999);
  return Math.sign(mate) * (100_000 - distancePenalty);
}

function parseInfoCandidate(
  line: string,
): { readonly multiPv: number; readonly candidate: AnalysisCandidate } | null {
  if (!line.startsWith("info ")) return null;
  const score = /\bscore\s+(cp|mate)\s+(-?\d+)\b/.exec(line);
  const pv = /\bpv\s+((?:[a-h][1-8][a-h][1-8][qrbn]?(?:\s+|$))+)/.exec(line);
  if (score === null || pv === null) return null;

  const scoreKind = score[1];
  const scoreValue = Number(score[2]);
  if (!Number.isFinite(scoreValue)) return null;
  const depthMatch = /\bdepth\s+(\d+)\b/.exec(line);
  const multiPvMatch = /\bmultipv\s+(\d+)\b/.exec(line);
  const depth = Number(depthMatch?.[1] ?? 0);
  const multiPv = Number(multiPvMatch?.[1] ?? 1);
  const principalVariation = pv[1]?.trim().split(/\s+/).slice(0, 20) ?? [];
  const uci = principalVariation[0];
  if (uci === undefined) return null;

  return {
    multiPv,
    candidate: {
      uci,
      evaluationCpFromSideToMove:
        scoreKind === "mate" ? mateToCentipawns(scoreValue) : scoreValue,
      principalVariation,
      depth,
    },
  };
}

export class StockfishAnalysisEngine implements AnalysisEngine {
  private readonly assetUrl: string;
  private readonly createWorker: (assetUrl: string) => AnalysisWorkerLike;
  private readonly initializationTimeoutMs: number;
  private readonly maximumSearchTimeMs: number;
  private worker: AnalysisWorkerLike | null = null;
  private initialization: PendingInitialization | null = null;
  private analysis: PendingAnalysis | null = null;
  private ready = false;
  private disposed = false;

  public constructor(options: StockfishAnalysisEngineOptions = {}) {
    this.assetUrl = options.assetUrl ?? DEFAULT_ASSET_URL;
    this.createWorker =
      options.createWorker ??
      ((assetUrl) => new Worker(assetUrl, { name: "stockfish-analysis" }));
    this.initializationTimeoutMs = options.initializationTimeoutMs ?? 5_000;
    this.maximumSearchTimeMs = options.maximumSearchTimeMs ?? 2_000;
  }

  public initialize(
    signal: AbortSignal,
  ): Promise<Result<void, AnalysisEngineFailure>> {
    if (this.disposed) {
      return Promise.resolve(
        err({ code: "crashed", message: "Analysis engine is disposed." }),
      );
    }
    if (this.ready) return Promise.resolve(ok(undefined));
    if (this.initialization !== null) {
      return Promise.resolve(
        err({
          code: "not-ready",
          message: "Initialization is already running.",
        }),
      );
    }
    if (signal.aborted) {
      return Promise.resolve(
        err({ code: "cancelled", message: "Initialization was cancelled." }),
      );
    }

    return new Promise((resolve) => {
      const worker = this.ensureWorker();
      const onAbort = () => {
        this.finishInitialization(
          err({ code: "cancelled", message: "Initialization was cancelled." }),
        );
        this.invalidateWorker();
      };
      const timeout = setTimeout(() => {
        this.finishInitialization(
          err({ code: "timeout", message: "Stockfish did not become ready." }),
        );
        this.invalidateWorker();
      }, this.initializationTimeoutMs);
      this.initialization = { resolve, timeout, signal, onAbort };
      signal.addEventListener("abort", onAbort, { once: true });
      worker.postMessage("uci");
    });
  }

  public analyze(
    request: AnalyzePositionRequest,
  ): Promise<Result<PositionAnalysis, AnalysisEngineFailure>> {
    if (!this.ready || this.worker === null) {
      return Promise.resolve(
        err({ code: "not-ready", message: "Stockfish is not ready." }),
      );
    }
    if (this.analysis !== null) {
      return Promise.resolve(
        err({ code: "not-ready", message: "An analysis is already running." }),
      );
    }
    if (request.signal.aborted) {
      return Promise.resolve(
        err({ code: "cancelled", message: "Analysis was cancelled." }),
      );
    }

    return new Promise((resolve) => {
      const worker = this.worker;
      if (worker === null) {
        resolve(err({ code: "not-ready", message: "Stockfish is not ready." }));
        return;
      }

      const searchTimeMs = Math.max(
        1,
        Math.min(request.timeBudgetMs, this.maximumSearchTimeMs),
      );
      const failureTimeMs = searchTimeMs + 250;
      const onAbort = () => {
        worker.postMessage("stop");
        this.finishAnalysis(
          err({ code: "cancelled", message: "Analysis was cancelled." }),
        );
        this.invalidateWorker();
      };
      const stopTimer = setTimeout(() => {
        worker.postMessage("stop");
      }, searchTimeMs);
      const failureTimer = setTimeout(() => {
        this.finishAnalysis(
          err({
            code: "timeout",
            message: "Stockfish exceeded its analysis budget.",
          }),
        );
        this.invalidateWorker();
      }, failureTimeMs);

      this.analysis = {
        resolve,
        stopTimer,
        failureTimer,
        signal: request.signal,
        onAbort,
        candidates: new Map(),
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
      worker.postMessage(
        `setoption name MultiPV value ${String(Math.max(1, Math.min(5, request.multiPv)))}`,
      );
      worker.postMessage(`position fen ${request.fen}`);
      worker.postMessage(`go movetime ${String(searchTimeMs)}`);
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.ready = false;
    this.finishInitialization(
      err({ code: "cancelled", message: "Analysis engine was disposed." }),
    );
    this.finishAnalysis(
      err({ code: "cancelled", message: "Analysis engine was disposed." }),
    );
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): AnalysisWorkerLike {
    if (this.worker !== null) return this.worker;
    const worker = this.createWorker(this.assetUrl);
    worker.onmessage = (event) => {
      this.handleMessage(event.data);
    };
    worker.onerror = (event) => {
      const message = event.message || "Stockfish analysis worker crashed.";
      this.ready = false;
      this.finishInitialization(err({ code: "crashed", message }));
      this.finishAnalysis(err({ code: "crashed", message }));
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    const line = data.trim();
    if (line === "uciok") {
      this.worker?.postMessage("setoption name Threads value 1");
      this.worker?.postMessage("setoption name Hash value 16");
      this.worker?.postMessage("isready");
      return;
    }
    if (line === "readyok") {
      if (this.initialization === null) return;
      this.ready = true;
      this.finishInitialization(ok(undefined));
      return;
    }

    const info = parseInfoCandidate(line);
    if (info !== null && this.analysis !== null) {
      const previous = this.analysis.candidates.get(info.multiPv);
      if (previous === undefined || info.candidate.depth >= previous.depth) {
        this.analysis.candidates.set(info.multiPv, info.candidate);
      }
      return;
    }

    if (/^bestmove\s+/.test(line) && this.analysis !== null) {
      const candidates = [...this.analysis.candidates.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, candidate]) => candidate);
      if (candidates.length === 0) {
        this.finishAnalysis(
          err({
            code: "no-analysis",
            message: "Stockfish returned no scored candidate.",
          }),
        );
      } else {
        this.finishAnalysis(ok({ candidates }));
      }
    }
  }

  private finishInitialization(
    result: Result<void, AnalysisEngineFailure>,
  ): void {
    const pending = this.initialization;
    if (pending === null) return;
    clearTimeout(pending.timeout);
    pending.signal.removeEventListener("abort", pending.onAbort);
    this.initialization = null;
    pending.resolve(result);
  }

  private finishAnalysis(
    result: Result<PositionAnalysis, AnalysisEngineFailure>,
  ): void {
    const pending = this.analysis;
    if (pending === null) return;
    clearTimeout(pending.stopTimer);
    clearTimeout(pending.failureTimer);
    pending.signal.removeEventListener("abort", pending.onAbort);
    this.analysis = null;
    pending.resolve(result);
  }

  private invalidateWorker(): void {
    this.ready = false;
    this.worker?.terminate();
    this.worker = null;
  }
}
