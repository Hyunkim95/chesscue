import { useEffect, useMemo, useState } from "react";

import {
  analyzeGameReport,
  type GameReport,
} from "../application/analyze-game/analyze-game-report";
import type { GameRecord } from "../domain/game/types";
import { StockfishAnalysisEngine } from "../infrastructure/engine/stockfish-analysis-engine";

export type GameReportState =
  | {
      readonly kind: "checking";
      readonly completed: number;
      readonly total: number;
    }
  | { readonly kind: "ready"; readonly report: GameReport }
  | { readonly kind: "failed" };

// Reports already checked this visit, so returning to a game is instant.
const reports = new Map<string, GameReport>();
const KEPT = 8;

// Stockfish's score of every position in a game, for the eval bar and the
// timeline. It runs on its own engine so the game's moments are found in
// parallel.
export function useGameReport(
  game: GameRecord | undefined,
  owner: string,
): GameReportState {
  const key = useMemo(
    () =>
      game &&
      JSON.stringify([
        "report/1",
        owner,
        game.id,
        game.initialFen,
        game.moves.map(({ uci }) => uci),
      ]),
    [owner, game],
  );
  const [state, setState] = useState<{
    readonly key: string | undefined;
    readonly value: GameReportState;
  }>({ key: undefined, value: { kind: "checking", completed: 0, total: 0 } });

  useEffect(() => {
    if (!game || key === undefined || reports.has(key)) return;
    const controller = new AbortController();
    const engine = new StockfishAnalysisEngine();
    const total = game.moves.length + 1;
    void analyzeGameReport(game, engine, controller.signal, (completed) => {
      setState({ key, value: { kind: "checking", completed, total } });
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok) {
          setState({ key, value: { kind: "failed" } });
          return;
        }
        if (reports.size >= KEPT) {
          const first = reports.keys().next().value;
          if (first !== undefined) reports.delete(first);
        }
        reports.set(key, result.value);
        setState({ key, value: { kind: "ready", report: result.value } });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, value: { kind: "failed" } });
      })
      .finally(() => {
        engine.dispose();
      });
    return () => {
      controller.abort();
      engine.dispose();
    };
  }, [game, key]);

  const cached = key === undefined ? undefined : reports.get(key);
  if (cached) return { kind: "ready", report: cached };
  if (state.key === key) return state.value;
  return {
    kind: "checking",
    completed: 0,
    total: game ? game.moves.length + 1 : 0,
  };
}
