import type { GameRecord } from "../../domain/game/types";

export type GameCompletedCallback = (
  record: GameRecord,
) => void | Promise<void>;

export interface GameCompletionObserver {
  notify(record: GameRecord): void;
}

export class OneShotGameCompletionObserver implements GameCompletionObserver {
  readonly #notifiedGameIds = new Set<string>();
  #callback: GameCompletedCallback | undefined;

  public constructor(callback?: GameCompletedCallback) {
    this.#callback = callback;
  }

  public setCallback(callback: GameCompletedCallback | undefined): void {
    this.#callback = callback;
  }

  public notify(record: GameRecord): void {
    if (
      record.completedAt === null ||
      record.result === null ||
      this.#notifiedGameIds.has(record.id)
    ) {
      return;
    }

    this.#notifiedGameIds.add(record.id);
    const callback = this.#callback;
    if (callback === undefined) return;

    try {
      void Promise.resolve(callback(record)).catch(() => undefined);
    } catch {
      return;
    }
  }
}
