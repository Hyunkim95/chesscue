import type {
  AnalysisEngine,
  AnalyzePositionRequest,
} from "../../application/analyze-game/analysis-engine";

// The Stockfish adapter runs one search at a time and needs initializing
// first. This queues requests so a try and a preview never collide.
export function serialEngine(engine: AnalysisEngine): AnalysisEngine {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    initialize: (signal) => engine.initialize(signal),
    analyze(request: AnalyzePositionRequest) {
      const run = queue.then(async () => {
        const ready = await engine.initialize(request.signal);
        return ready.ok ? engine.analyze(request) : ready;
      });
      queue = run.catch(() => undefined);
      return run;
    },
    dispose: () => {
      engine.dispose();
    },
  };
}
