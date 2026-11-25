import { useEffect, useState } from "react";
import type { GameRepository } from "../application/ports/game-repository";
import type { AnalysisRepository } from "../application/ports/analysis-repository";
import type { CompletedGameAnalysis } from "../application/analyze-game/analyze-completed-game";
import type { GameRecord } from "../domain/game/types";
import type { Result } from "../shared/result/result";
import {
  observedGameMoves,
  type ObservedMove,
} from "../domain/curriculum/game-drill";
import {
  buildPlayingSnapshot,
  snapshotGames,
} from "../domain/curriculum/playing-snapshot";
import { ANALYSIS_VERSION } from "./adaptive-profile";

export type SnapshotState =
  | { status: "checking" }
  | { status: "failed"; message: string }
  | {
      status: "ready";
      games: readonly GameRecord[];
      checked: number;
      failed: number;
      total: number;
      plan: ReturnType<typeof buildPlayingSnapshot>;
    };
export function usePlayingSnapshot(
  gamesRepository: GameRepository,
  analyses: AnalysisRepository,
  enabled: boolean,
  analyze: (game: GameRecord) => Promise<Result<CompletedGameAnalysis, string>>,
) {
  const [state, setState] = useState<SnapshotState>({ status: "checking" });
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const isCurrent = () => current;
    async function prepare() {
      const listed = await gamesRepository.listCompleted();
      if (!isCurrent()) return;
      if (!listed.ok) {
        setState({ status: "failed", message: listed.error.message });
        return;
      }
      const games = snapshotGames(listed.value);
      const eligible = games.filter((g) => g.moves.length > 0);
      if (!eligible.length) {
        setState({
          status: "ready",
          games,
          checked: 0,
          failed: 0,
          total: 0,
          plan: buildPlayingSnapshot([]),
        });
        return;
      }
      const cached = await analyses.listAll();
      if (!current) return;
      const byGame = new Map(
        (cached.ok ? cached.value : [])
          .filter((a) => a.analysisVersion === ANALYSIS_VERSION)
          .map((a) => [a.gameId, a]),
      );
      const moves: ObservedMove[] = [];
      const missing: GameRecord[] = [];
      let checked = 0,
        failed = 0;
      function publish() {
        if (isCurrent())
          setState({
            status: "ready",
            games,
            checked,
            failed,
            total: eligible.length,
            plan: buildPlayingSnapshot(moves),
          });
      }
      for (const game of eligible) {
        const record = byGame.get(game.id);
        if (record) {
          moves.push(...observedGameMoves(game, record));
          checked++;
        } else missing.push(game);
      }
      publish();
      for (const game of missing.reverse()) {
        if (!isCurrent()) return;
        const result = await analyze(game);
        if (!isCurrent()) return;
        if (result.ok) {
          moves.push(...observedGameMoves(game, result.value));
          checked++;
        } else failed++;
        publish();
      }
    }
    void prepare().catch(() => {
      if (isCurrent())
        setState({
          status: "failed",
          message:
            "Your games could not be checked. Reopen Training plan to try again.",
        });
    });
    return () => {
      current = false;
    };
  }, [gamesRepository, analyses, enabled, analyze]);
  return state;
}
