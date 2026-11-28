import { useEffect, useState } from "react";

import { observedGameMoves } from "../domain/curriculum/game-drill";
import type { GameId } from "../domain/game/types";
import { watchMarkers } from "../domain/session/game-watch";
import type { PlayerHistory } from "../infrastructure/persistence/player-history";
import { ANALYSIS_VERSION } from "./adaptive-profile";

export interface MomentCounts {
  readonly wins: number;
  readonly misses: number;
}

// Completed games and their analysis are immutable, so each game's counts
// are read once per player.
const known = new Map<string, MomentCounts>();

// The moments each checked game's replay stops at, for the rows in Games.
// It reads saved analysis only and never starts Stockfish; a game still being
// checked has no counts yet.
export function useMomentCounts(
  history: PlayerHistory,
  enabled: boolean,
  // Changes whenever games or their analysis may have changed.
  revision: string,
): ReadonlyMap<GameId, MomentCounts> {
  const [counts, setCounts] = useState<ReadonlyMap<GameId, MomentCounts>>(
    () => new Map(),
  );
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const stale = () => controller.signal.aborted;
    void (async () => {
      const listed = await history.games.listCompleted();
      if (stale() || !listed.ok) return;
      const found = new Map<GameId, MomentCounts>();
      for (const game of listed.value) {
        const key = JSON.stringify([history.name, game.id]);
        const cached = known.get(key);
        if (cached) {
          found.set(game.id, cached);
          continue;
        }
        const record = await history.analyses.get(game.id, ANALYSIS_VERSION);
        if (stale()) return;
        if (!record.ok || record.value === null) continue;
        const markers = watchMarkers(
          observedGameMoves(game, record.value),
          record.value.moments,
        );
        const value = {
          wins: markers.filter(({ kind }) => kind === "win").length,
          misses: markers.filter(({ kind }) => kind === "miss").length,
        };
        known.set(key, value);
        found.set(game.id, value);
      }
      if (!stale()) setCounts(found);
    })();
    return () => {
      controller.abort();
    };
  }, [history, enabled, revision]);
  return counts;
}
