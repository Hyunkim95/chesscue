import { useEffect, useRef, useState } from "react";
import { z } from "zod";
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
import {
  boardSequence,
  predictBoardUnits,
} from "../domain/curriculum/board-unit-model";

// Adds the board model's unit to each drill so the practice recommendation
// follows the tactic in the missed line. Results are cached per position and
// line; without the model the classifier fallback in unitForDrill applies.
async function addBoardUnits(
  moves: ObservedMove[],
  history: PlayerHistory,
  isCurrent: () => boolean,
) {
  const { loadBoardUnitModel } =
    await import("../infrastructure/models/board-unit-model-asset");
  const model = await loadBoardUnitModel();
  if (!model) return;
  const prediction = z.object({
    unitId: z.string().min(1),
    probability: z.number().min(0).max(1),
  });
  for (const [index, entry] of moves.entries()) {
    if (!isCurrent()) return;
    if (entry.drill.mateInOne || entry.drill.backRank) continue;
    const { fen, verification } = entry.drill.exercise;
    const fens = boardSequence(fen, verification.principalVariation);
    if (!fens) continue;
    const key = history.key(JSON.stringify([model.name, fens]));
    let cached: z.infer<typeof prediction> | undefined;
    try {
      const stored = prediction.safeParse(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
      if (stored.success) cached = stored.data;
    } catch {
      // An unreadable cache entry is recomputed.
    }
    const top = cached ?? predictBoardUnits(model, fens)[0];
    if (!top) continue;
    if (!cached) {
      try {
        localStorage.setItem(key, JSON.stringify(top));
      } catch {
        // Storage is a cache only.
      }
      // Yield between predictions so the panel stays responsive.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    moves[index] = {
      ...entry,
      drill: {
        ...entry.drill,
        predictedUnit: { ...top, model: model.name },
      },
    };
  }
}

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
  // The inputs of the last run that finished. Switching to a screen that does
  // not need the snapshot and back keeps it instead of rebuilding it.
  const finished = useRef<
    | { history: PlayerHistory; revision: number; analyze: typeof analyze }
    | undefined
  >(undefined);
  useEffect(() => {
    if (!enabled) return;
    const done = finished.current;
    if (
      done?.history === history &&
      done.revision === revision &&
      done.analyze === analyze
    )
      return;
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
        finished.current = { history, revision, analyze };
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
      // Board-model units come after the mate labels: mates never use them, and
      // running them first would delay the back-rank recommendation.
      await addBoardUnits(moves, history, isCurrent);
      publish();
      if (isCurrent()) finished.current = { history, revision, analyze };
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
