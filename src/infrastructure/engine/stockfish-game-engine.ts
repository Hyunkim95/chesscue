import type {
  EngineFailure,
  EngineMove,
  EngineMoveRequest,
  GameEngine,
} from "../../application/ports/game-engine";
import { ratedOpponentElo } from "../../domain/game/rating";
import type { Result } from "../../shared/result/result";
import { err, ok } from "../../shared/result/result";

interface WorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: string): void;
  terminate(): void;
}

export interface StockfishGameEngineOptions {
  readonly assetUrl?: string;
  readonly createWorker?: (assetUrl: string) => WorkerLike;
  readonly initializationTimeoutMs?: number;
}

interface PendingInitialization {
  readonly resolve: (result: Result<void, EngineFailure>) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
}

interface PendingSearch {
  readonly resolve: (result: Result<EngineMove, EngineFailure>) => void;
  readonly stopTimer: ReturnType<typeof setTimeout>;
  readonly failureTimer: ReturnType<typeof setTimeout>;
  readonly signal: AbortSignal;
  readonly onAbort: () => void;
}

const DEFAULT_ASSET_URL = "/stockfish/stockfish-19-lite-single.js";
const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export class StockfishGameEngine implements GameEngine {
  private readonly assetUrl: string;
  private readonly createWorker: (assetUrl: string) => WorkerLike;
  private readonly initializationTimeoutMs: number;
  private worker: WorkerLike | null = null;
  private initialization: PendingInitialization | null = null;
  private search: PendingSearch | null = null;
  private ready = false;
  private disposed = false;

  public constructor(options: StockfishGameEngineOptions = {}) {
    this.assetUrl = options.assetUrl ?? DEFAULT_ASSET_URL;
    this.createWorker =
      options.createWorker ??
      ((assetUrl) => new Worker(assetUrl, { name: "stockfish-game" }));
    this.initializationTimeoutMs = options.initializationTimeoutMs ?? 5000;
  }

  public initialize(signal: AbortSignal): Promise<Result<void, EngineFailure>> {
    if (this.disposed)
      return Promise.resolve(
        err({ code: "crashed", message: "Engine is disposed" }),
      );
    if (this.ready) return Promise.resolve(ok(undefined));
    if (this.initialization !== null) {
      return Promise.resolve(err({ code: "not-ready" }));
    }
    if (signal.aborted) return Promise.resolve(err({ code: "cancelled" }));

    return new Promise((resolve) => {
      const worker = this.ensureWorker();
      const onAbort = () => {
        this.finishInitialization(err({ code: "cancelled" }));
        this.invalidateWorker();
      };
      const timeout = setTimeout(() => {
        this.finishInitialization(err({ code: "timeout" }));
        this.invalidateWorker();
      }, this.initializationTimeoutMs);
      this.initialization = { resolve, timeout, signal, onAbort };
      signal.addEventListener("abort", onAbort, { once: true });
      worker.postMessage("uci");
    });
  }

  public chooseMove(
    request: EngineMoveRequest,
  ): Promise<Result<EngineMove, EngineFailure>> {
    if (!this.ready || this.worker === null)
      return Promise.resolve(err({ code: "not-ready" }));
    if (this.search !== null) {
      return Promise.resolve(
        err({ code: "crashed", message: "A search is already in progress" }),
      );
    }
    if (request.signal.aborted)
      return Promise.resolve(err({ code: "cancelled" }));

    return new Promise((resolve) => {
      const worker = this.worker;
      if (worker === null) {
        resolve(err({ code: "not-ready" }));
        return;
      }

      const stopAtMs = Math.min(request.timeBudgetMs, 4750);
      const failAtMs = Math.min(stopAtMs + 250, 5000);
      const onAbort = () => {
        worker.postMessage("stop");
        this.finishSearch(err({ code: "cancelled" }));
        this.invalidateWorker();
      };
      const stopTimer = setTimeout(() => {
        worker.postMessage("stop");
      }, stopAtMs);
      const failureTimer = setTimeout(() => {
        this.finishSearch(err({ code: "timeout" }));
        this.invalidateWorker();
      }, failAtMs);
      this.search = {
        resolve,
        stopTimer,
        failureTimer,
        signal: request.signal,
        onAbort,
      };
      request.signal.addEventListener("abort", onAbort, { once: true });

      const targetElo = ratedOpponentElo(request.targetElo);
      worker.postMessage("setoption name UCI_LimitStrength value true");
      worker.postMessage(
        `setoption name UCI_Elo value ${targetElo.toString()}`,
      );
      worker.postMessage(`position fen ${request.fen}`);
      const searchMoves = [...new Set(request.searchMoves ?? [])]
        .filter((move) => UCI_MOVE_PATTERN.test(move))
        .slice(0, 8);
      worker.postMessage(
        searchMoves.length === 0
          ? `go movetime ${stopAtMs.toString()}`
          : `go searchmoves ${searchMoves.join(" ")} movetime ${stopAtMs.toString()}`,
      );
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.ready = false;
    this.finishInitialization(err({ code: "cancelled" }));
    this.finishSearch(err({ code: "cancelled" }));
    this.worker?.terminate();
    this.worker = null;
  }

  private ensureWorker(): WorkerLike {
    if (this.worker !== null) return this.worker;
    const worker = this.createWorker(this.assetUrl);
    worker.onmessage = (event) => {
      this.handleMessage(event.data);
    };
    worker.onerror = (event) => {
      const message = event.message || "Stockfish worker crashed";
      this.ready = false;
      this.finishInitialization(err({ code: "crashed", message }));
      this.finishSearch(err({ code: "crashed", message }));
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    const line = data.trim();

    if (line === "uciok") {
      this.worker?.postMessage("isready");
      return;
    }
    if (line === "readyok") {
      if (this.initialization === null) return;
      this.ready = true;
      this.finishInitialization(ok(undefined));
      return;
    }

    const bestMove = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/.exec(
      line,
    )?.[1];
    if (bestMove !== undefined && this.search !== null) {
      this.finishSearch(ok({ uci: bestMove }));
    }
  }

  private finishInitialization(result: Result<void, EngineFailure>): void {
    const pending = this.initialization;
    if (pending === null) return;
    clearTimeout(pending.timeout);
    pending.signal.removeEventListener("abort", pending.onAbort);
    this.initialization = null;
    pending.resolve(result);
  }

  private finishSearch(result: Result<EngineMove, EngineFailure>): void {
    const pending = this.search;
    if (pending === null) return;
    clearTimeout(pending.stopTimer);
    clearTimeout(pending.failureTimer);
    pending.signal.removeEventListener("abort", pending.onAbort);
    this.search = null;
    pending.resolve(result);
  }

  private invalidateWorker(): void {
    this.ready = false;
    this.worker?.terminate();
    this.worker = null;
  }
}
