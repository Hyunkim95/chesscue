import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import type { GameId } from "../../domain/game/types";
import { importGames } from "../import-games/import-games";
import { ok } from "../../shared/result/result";
import type {
  AnalysisEngine,
  AnalyzePositionRequest,
  PositionAnalysis,
} from "./analysis-engine";
import { analyzeCompletedGame } from "./analyze-completed-game";

const FIXED_PGN = `[Event "Fixed bridge fixture"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

class DeterministicAnalysisEngine implements AnalysisEngine {
  public readonly requests: AnalyzePositionRequest[] = [];
  public disposed = false;

  public initialize() {
    return Promise.resolve(ok(undefined));
  }

  public analyze(request: AnalyzePositionRequest) {
    this.requests.push(request);
    const chess = new Chess(request.fen);
    const move = chess.moves({ verbose: true })[0];
    if (move === undefined)
      throw new Error("Fixture produced a terminal analysis position");
    const evaluationCpFromSideToMove = chess.turn() === "w" ? 40 : 100;
    const value: PositionAnalysis = {
      candidates: [
        {
          uci: `${move.from}${move.to}${move.promotion ?? ""}`,
          evaluationCpFromSideToMove,
          principalVariation: [`${move.from}${move.to}${move.promotion ?? ""}`],
          depth: 8,
        },
      ],
    };
    return Promise.resolve(ok(value));
  }

  public dispose(): void {
    this.disposed = true;
  }
}

function importedFixture() {
  const result = importGames({
    text: FIXED_PGN,
    source: { type: "paste" },
    playerColor: "white",
    existingFingerprints: new Set(),
    idFactory: () => "fixed-game" as GameId,
    now: () => "2026-11-24T12:00:00.000Z",
    curriculumVersion: "curriculum-1",
    configurationVersion: "configuration-1",
  });
  const item = result.items[0];
  if (item?.status !== "accepted") throw new Error("Fixed PGN import failed");
  return item.game.record;
}

describe("analyzeCompletedGame fixed PGN bridge", () => {
  it("replays a completed game into player-normalized validated facts and moments", async () => {
    const engine = new DeterministicAnalysisEngine();
    const result = await analyzeCompletedGame({
      game: importedFixture(),
      playerColor: "white",
      engine,
      analysisVersion: "stockfish-19-lite:100ms:multipv3",
      timeBudgetPerPositionMs: 100,
      signal: new AbortController().signal,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.analyzedPlayerMoves).toBe(3);
    expect(result.value.facts).toHaveLength(3);
    expect(engine.requests).toHaveLength(6);
    expect(result.value.facts[0]).toMatchObject({
      ply: 1,
      evaluationBeforeCp: 40,
      evaluationAfterCp: -100,
      impactCp: 140,
      analysisVersion: "stockfish-19-lite:100ms:multipv3",
    });
    expect(result.value.moments.length).toBeGreaterThan(0);
    expect(result.value.moments.length).toBeLessThanOrEqual(3);
    expect(
      result.value.moments.every((moment) => moment.gameId === "fixed-game"),
    ).toBe(true);
  });

  it("uses the learner color preserved by PGN import", async () => {
    const result = await analyzeCompletedGame({
      game: importedFixture(),
      engine: new DeterministicAnalysisEngine(),
      analysisVersion: "analysis-1",
      timeBudgetPerPositionMs: 100,
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      ok: true,
      value: { analyzedPlayerMoves: 3 },
    });
  });

  it("honors a pre-aborted analysis request without starting the engine", async () => {
    const abort = new AbortController();
    abort.abort();
    const engine = new DeterministicAnalysisEngine();
    const result = await analyzeCompletedGame({
      game: importedFixture(),
      playerColor: "white",
      engine,
      analysisVersion: "analysis-1",
      timeBudgetPerPositionMs: 100,
      signal: abort.signal,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "engine-failure", cause: { code: "cancelled" } },
    });
    expect(engine.requests).toHaveLength(0);
  });
});
