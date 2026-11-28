import type { ExplorationEvidence } from "./rook-exploration-model";

export interface RookExplorationCoach {
  readonly initialize: () => Promise<void>;
  readonly ask: (
    evidence: ExplorationEvidence,
    signal: AbortSignal,
  ) => Promise<string | null>;
}

export function createRookExplorationCoach(): RookExplorationCoach | null {
  if (typeof window === "undefined" || window.LanguageModel === undefined)
    return null;
  // Firebase AI loads the first time Rook is asked, never with the first
  // screen (SLO-014).
  const model = import("./rook-exploration-model")
    .then((module) => module.createOnDeviceRookExplorationCoach())
    .catch(() => null);
  return {
    async initialize() {
      await (await model)?.initialize();
    },
    async ask(evidence, signal) {
      return (await (await model)?.ask(evidence, signal)) ?? null;
    },
  };
}
