import { useEffect, useState } from "react";
import { z } from "zod";
import {
  createGameId,
  type GameId,
  type GameRecord,
} from "../domain/game/types";
import type { PlayerHistory } from "../infrastructure/persistence/player-history";

const pendingIds = z.array(z.string().trim().min(1).transform(createGameId));
const pendingKey = "chesscue-pending-import-analysis";
const pendingChanged = "chesscue-pending-import-analysis-changed";

function readPending(history: PlayerHistory): readonly GameId[] {
  try {
    const parsed = pendingIds.safeParse(
      JSON.parse(localStorage.getItem(history.key(pendingKey)) ?? "[]"),
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function writePending(history: PlayerHistory, ids: readonly GameId[]) {
  try {
    localStorage.setItem(history.key(pendingKey), JSON.stringify(ids));
    window.dispatchEvent(
      new CustomEvent(pendingChanged, { detail: history.name }),
    );
  } catch {
    // The saved game can still be analyzed from Review or Training.
  }
}

export function queueImportAnalysis(
  history: PlayerHistory,
  games: readonly GameRecord[],
) {
  const ids = games.flatMap((game) =>
    game.playerColor !== null && game.moves.length > 0 ? [game.id] : [],
  );
  if (ids.length > 0)
    writePending(history, [...new Set([...readPending(history), ...ids])]);
}

export function useImportAnalysis(
  history: PlayerHistory,
  enabled: boolean,
  revision: number,
  analyze: (history: PlayerHistory, game: GameRecord) => Promise<unknown>,
) {
  const [pending, setPending] = useState(() => new Set(readPending(history)));
  useEffect(() => {
    const update = () => {
      setPending(new Set(readPending(history)));
    };
    const local = (event: Event) => {
      if (event instanceof CustomEvent && event.detail === history.name)
        update();
    };
    const external = (event: StorageEvent) => {
      if (event.key === history.key(pendingKey)) update();
    };
    update();
    window.addEventListener(pendingChanged, local);
    window.addEventListener("storage", external);
    return () => {
      window.removeEventListener(pendingChanged, local);
      window.removeEventListener("storage", external);
    };
  }, [history]);

  useEffect(() => {
    if (!enabled || readPending(history).length === 0) return;
    let active = true;
    const isActive = () => active;
    async function run(ids: readonly GameId[]) {
      for (const id of ids) {
        if (!isActive()) return;
        const result = await history.games.get(id);
        if (!isActive() || !result.ok) return;
        if (result.value !== null) await analyze(history, result.value);
        // A failed search can be retried by opening the game. Do not loop on it.
        writePending(
          history,
          readPending(history).filter((gameId) => gameId !== id),
        );
      }
    }
    const start = () => {
      void run(readPending(history));
    };
    if (typeof window.requestIdleCallback !== "function") {
      const timer = window.setTimeout(start, 0);
      return () => {
        active = false;
        window.clearTimeout(timer);
      };
    }
    const idleRequest = window.requestIdleCallback(start);
    return () => {
      active = false;
      window.cancelIdleCallback(idleRequest);
    };
  }, [history, enabled, revision, analyze]);
  return pending;
}
