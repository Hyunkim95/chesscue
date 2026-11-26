import { useEffect, useState } from "react";
import type { PlayerHistory } from "../infrastructure/persistence/player-history";
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
      moves: readonly ObservedMove[];
      checked: number;
      failed: number;
      total: number;
      plan: ReturnType<typeof buildPlayingSnapshot>;
    };
export function usePlayingSnapshot(
  history: PlayerHistory,
  enabled: boolean,
  revision: number,
  analyze: (
    history: PlayerHistory,
    game: GameRecord,
  ) => Promise<Result<CompletedGameAnalysis, string>>,
) {
  const [state, setState] = useState<SnapshotState>({ status: "checking" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted;
    async function prepare() {
      const listed = await history.games.listCompleted();
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
          moves: [],
          checked: 0,
          failed: 0,
          total: 0,
          plan: buildPlayingSnapshot([]),
        });
        return;
      }
      const cached = await history.analyses.listAll();
      if (!isCurrent()) return;
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
            moves: [...moves],
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
        const result = await analyze(history, game);
        if (!isCurrent()) return;
        if (result.ok) {
          moves.push(...observedGameMoves(game, result.value));
          checked++;
        } else failed++;
        publish();
      }
      const nano = await import("../infrastructure/ai/on-device-capability")
        .then(
          async ({ detectOnDeviceCapability }) =>
            (await detectOnDeviceCapability()).status === "available",
        )
        .catch(() => false);
      for (const [index, entry] of moves.entries()) {
        if (!entry.drill.mateInOne || !isCurrent()) continue;
        const { fen, verification } = entry.drill.exercise;
        const move = verification.principalVariation[0];
        if (!move) continue;
        const key = history.key(
          JSON.stringify(["gemini-nano-mate-motif-v1", fen, move]),
        );
        try {
          let motif = localStorage.getItem(key);
          if (motif !== "back-rank" && motif !== "other" && nano) {
            const { classifyMateMotif } =
              await import("../infrastructure/ai/mate-motif-gemini");
            motif = await classifyMateMotif(
              fen,
              move,
              "device",
              AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
            );
            if (isCurrent() && (motif === "back-rank" || motif === "other"))
              localStorage.setItem(key, motif);
          }
          if (motif === "back-rank" && isCurrent()) {
            moves[index] = {
              ...entry,
              drill: { ...entry.drill, backRank: true, followUps: [] },
            };
            publish();
          }
        } catch {
          // A verified mate remains playable even without a model label.
        }
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
      controller.abort();
    };
  }, [history, enabled, revision, analyze]);
  return state;
}
