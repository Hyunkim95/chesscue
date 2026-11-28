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
import { detectOnDeviceCapability } from "../infrastructure/ai/on-device-capability";
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
  mode: "off" | "saved" | "backfill",
  revision: number,
  analysisRevision: number,
  waitForCurrent: boolean,
  analyze: (
    history: PlayerHistory,
    game: GameRecord,
  ) => Promise<Result<CompletedGameAnalysis, string>>,
) {
  const [published, setPublished] = useState<{
    history: PlayerHistory;
    revision: number;
    analysisRevision: number;
    state: SnapshotState;
  }>();
  // Completed games and their active-version analysis are immutable.
  const observations = useRef(new Map<string, readonly ObservedMove[]>());
  // The inputs of the last run that finished. Switching to a screen that does
  // not need the snapshot and back keeps it instead of rebuilding it.
  const finished = useRef<
    | {
        history: PlayerHistory;
        revision: number;
        analysisRevision: number;
        backfilled: boolean;
      }
    | undefined
  >(undefined);
  useEffect(() => {
    if (mode === "off") return;
    const done = finished.current;
    if (
      done?.history === history &&
      done.revision === revision &&
      done.analysisRevision === analysisRevision &&
      (mode === "saved" || done.backfilled)
    )
      return;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted;
    const setState = (state: SnapshotState) => {
      setPublished({ history, revision, analysisRevision, state });
    };
    async function prepare() {
      const listed = await history.games.listCompleted();
      if (!isCurrent()) return;
      if (!listed.ok) {
        setState({ status: "failed", message: listed.error.message });
        return;
      }
      const games = snapshotGames(listed.value);
      const eligible = games.filter((g) => g.moves.length > 0);
      const existingMoves: ObservedMove[] = [];
      const newMoves: ObservedMove[] = [];
      const newGames: { key: string; start: number; end: number }[] = [];
      const missing: GameRecord[] = [];
      let checked = 0;
      let failed = 0;
      function publish() {
        if (!isCurrent()) return;
        const moves = existingMoves.concat(newMoves);
        setState({
          status: "ready",
          games,
          moves,
          checked,
          failed,
          total: eligible.length,
          plan: buildPlayingSnapshot(moves),
        });
      }
      const keyFor = (game: GameRecord) =>
        JSON.stringify([history.name, game.id]);
      function collect(game: GameRecord, analysis: CompletedGameAnalysis) {
        const start = newMoves.length;
        newMoves.push(...observedGameMoves(game, analysis));
        newGames.push({ key: keyFor(game), start, end: newMoves.length });
        checked++;
      }
      for (const game of eligible) {
        const cached = observations.current.get(keyFor(game));
        if (cached !== undefined) {
          existingMoves.push(...cached);
          checked++;
          continue;
        }
        const record = await history.analyses.get(game.id, ANALYSIS_VERSION);
        if (!isCurrent()) return;
        if (!record.ok) failed++;
        else if (record.value !== null) collect(game, record.value);
        else missing.push(game);
      }
      publish();
      if (mode === "backfill") {
        for (const game of missing.reverse()) {
          if (!isCurrent()) return;
          const result = await analyze(history, game);
          if (!isCurrent()) return;
          if (result.ok) collect(game, result.value);
          else failed++;
          publish();
        }
      }
      const nano = newMoves.some(({ drill }) => drill.mateInOne)
        ? await detectOnDeviceCapability()
            .then(({ status }) => status === "available")
            .catch(() => false)
        : false;
      for (const [index, entry] of newMoves.entries()) {
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
            newMoves[index] = {
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
      if (newMoves.some(({ drill }) => !drill.mateInOne && !drill.backRank)) {
        await addBoardUnits(newMoves, history, isCurrent);
        publish();
      }
      if (!isCurrent()) return;
      for (const { key, start, end } of newGames)
        observations.current.set(key, newMoves.slice(start, end));
      finished.current = {
        history,
        revision,
        analysisRevision,
        backfilled: mode === "backfill" || checked === eligible.length,
      };
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
  }, [history, mode, revision, analysisRevision, analyze]);
  if (
    published?.history !== history ||
    (waitForCurrent &&
      (published.revision !== revision ||
        published.analysisRevision !== analysisRevision))
  )
    return { status: "checking" } satisfies SnapshotState;
  return published.state;
}
