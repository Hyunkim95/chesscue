import "fake-indexeddb/auto";

import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import type { AnalysisRecord } from "../../application/ports/analysis-repository";
import type { ReviewEvidenceRecord } from "../../application/ports/review-evidence-repository";
import type { GameId, GameRecord } from "../../domain/game/types";

import {
  deleteChessTutorDatabase,
  openChessTutorDatabase,
} from "./chess-tutor-database";
import { IndexedDbAnalysisRepository } from "./indexeddb-analysis-repository";
import { IndexedDbGameRepository } from "./indexeddb-game-repository";
import { IndexedDbReviewEvidenceRepository } from "./indexeddb-review-evidence-repository";

const openRepositories: (
  | IndexedDbGameRepository
  | IndexedDbAnalysisRepository
  | IndexedDbReviewEvidenceRepository
)[] = [];
const databaseNames: string[] = [];

const createDatabaseName = (): string => {
  const name = `adaptive-storage-${crypto.randomUUID()}`;
  databaseNames.push(name);
  return name;
};

afterEach(async () => {
  await Promise.all(
    openRepositories.splice(0).map((repository) => repository.close()),
  );
  await Promise.all(databaseNames.splice(0).map(deleteChessTutorDatabase));
});

const gameRecord = (id = "game-1"): GameRecord => ({
  schemaVersion: 1,
  id: id as GameId,
  origin: { type: "tutor" },
  initialFen: "start",
  moves: [],
  pgn: "1-0",
  playerColor: "white",
  result: "white-win",
  createdAt: "2026-11-24T12:00:00.000Z",
  completedAt: "2026-11-24T12:10:00.000Z",
  curriculumVersion: "1.0.0",
  configurationVersion: "1.0.0",
  fingerprint: null,
});

const analysisRecord = (
  gameId = "game-1",
  analysisVersion = "stockfish-19-lite@1",
): AnalysisRecord => {
  const fact = {
    schemaVersion: 1 as const,
    gameId,
    ply: 1,
    fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    playedMoveUci: "e2e4",
    playedMoveSan: "e4",
    evaluationBeforeCp: 20,
    evaluationAfterCp: -80,
    impactCp: 100,
    phase: "opening" as const,
    theme: "development" as const,
    recurrence: 1,
    curricularRelevance: 80,
    candidates: [
      {
        uci: "g1f3",
        san: "Nf3",
        evaluationCp: 20,
        principalVariation: ["g1f3"],
      },
    ],
    analysisVersion,
  };
  return {
    schemaVersion: 1,
    gameId,
    analysisVersion,
    engineBuild: "stockfish-19-lite-single",
    searchSettings: { timeBudgetPerPositionMs: 100, multiPv: 3 },
    facts: [fact],
    moments: [
      {
        id: `${gameId}:1:${analysisVersion}`,
        gameId,
        ply: 1,
        fenBefore: fact.fenBefore,
        playedMoveUci: fact.playedMoveUci,
        playedMoveSan: fact.playedMoveSan,
        candidateMoveUci: "g1f3",
        candidateMoveSan: "Nf3",
        impactCp: fact.impactCp,
        theme: fact.theme,
        phase: fact.phase,
        analysisVersion,
        trace: {
          evaluationBeforeCp: fact.evaluationBeforeCp,
          evaluationAfterCp: fact.evaluationAfterCp,
          recurrence: fact.recurrence,
          curricularRelevance: fact.curricularRelevance,
        },
      },
    ],
    analyzedPlayerMoves: 1,
    validationStatus: "validated",
    analyzedAt: "2026-11-24T12:11:00.000Z",
  };
};

const reviewEvidence = (
  id = "review-1",
  gameId = "game-1",
  dueReview = "2026-11-25",
): ReviewEvidenceRecord => ({
  schemaVersion: 1,
  id,
  gameId,
  analysisVersion: "stockfish-19-lite@1",
  theme: "one-move-threat",
  firstAttemptScore: 50,
  hardSpot: "Choosing a move that resolves the demand",
  dueReview,
  reinforcement:
    "Scan checks, captures, and direct attacks before choosing a plan.",
  transfer: "scheduled-next-game",
  completedAt: "2026-11-24T12:12:00.000Z",
});

const track = <
  T extends
    | IndexedDbGameRepository
    | IndexedDbAnalysisRepository
    | IndexedDbReviewEvidenceRepository,
>(
  repository: T,
): T => {
  openRepositories.push(repository);
  return repository;
};

describe("adaptive IndexedDB records", () => {
  it("returns only the newest unfinished tutor game for resume", async () => {
    const repository = track(new IndexedDbGameRepository(createDatabaseName()));
    const older: GameRecord = {
      ...gameRecord("active-older"),
      pgn: "",
      result: null,
      completedAt: null,
      createdAt: "2026-11-24T10:00:00.000Z",
    };
    const newer: GameRecord = {
      ...gameRecord("active-newer"),
      pgn: "",
      result: null,
      completedAt: null,
      createdAt: "2026-11-24T11:00:00.000Z",
    };
    expect(await repository.put(older)).toEqual({ ok: true, value: undefined });
    expect(await repository.put(newer)).toEqual({ ok: true, value: undefined });
    expect(await repository.put(gameRecord("completed"))).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await repository.getLatestInProgress()).toEqual({
      ok: true,
      value: newer,
    });
  });

  it("migrates a v1 database without losing games and survives repository reload", async () => {
    const databaseName = createDatabaseName();
    const versionOne = await openDB(databaseName, 1, {
      upgrade(database) {
        database.createObjectStore("games", { keyPath: "id" });
      },
    });
    await versionOne.put("games", gameRecord());
    versionOne.close();

    const analysisRepository = track(
      new IndexedDbAnalysisRepository(databaseName),
    );
    const evidenceRepository = track(
      new IndexedDbReviewEvidenceRepository(databaseName),
    );
    expect(await analysisRepository.put(analysisRecord())).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await evidenceRepository.put(reviewEvidence())).toEqual({
      ok: true,
      value: undefined,
    });
    await analysisRepository.close();
    await evidenceRepository.close();

    const reloadedGames = track(new IndexedDbGameRepository(databaseName));
    const reloadedAnalyses = track(
      new IndexedDbAnalysisRepository(databaseName),
    );
    const reloadedEvidence = track(
      new IndexedDbReviewEvidenceRepository(databaseName),
    );
    expect(await reloadedGames.get("game-1" as GameId)).toEqual({
      ok: true,
      value: gameRecord(),
    });
    expect(await reloadedAnalyses.get("game-1", "stockfish-19-lite@1")).toEqual(
      {
        ok: true,
        value: analysisRecord(),
      },
    );
    expect(await reloadedEvidence.get("review-1")).toEqual({
      ok: true,
      value: reviewEvidence(),
    });

    const database = await openChessTutorDatabase(databaseName);
    expect([...database.objectStoreNames]).toEqual([
      "analyses",
      "games",
      "reviewEvidence",
    ]);
    database.close();
  });

  it("keeps analysis versions immutable, idempotent, and listable for recomputation", async () => {
    const repository = track(
      new IndexedDbAnalysisRepository(createDatabaseName()),
    );
    const first = analysisRecord("game-1", "analysis-1");
    const second = analysisRecord("game-1", "analysis-2");

    expect(await repository.put(first)).toEqual({ ok: true, value: undefined });
    expect(await repository.put(structuredClone(first))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await repository.put(second)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      await repository.put({ ...first, engineBuild: "different-build" }),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await repository.listByGame("game-1")).toEqual({
      ok: true,
      value: [first, second],
    });
    expect(await repository.listAll()).toEqual({
      ok: true,
      value: [first, second],
    });
  });

  it("keeps review evidence immutable and exposes game, theme, and due-review lists", async () => {
    const repository = track(
      new IndexedDbReviewEvidenceRepository(createDatabaseName()),
    );
    const due = reviewEvidence("review-1", "game-1", "2026-11-25");
    const later = reviewEvidence("review-2", "game-2", "2026-11-29");

    expect(await repository.put(due)).toEqual({ ok: true, value: undefined });
    expect(await repository.put(structuredClone(due))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await repository.put(later)).toEqual({ ok: true, value: undefined });
    expect(
      await repository.put({ ...due, firstAttemptScore: 100 }),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await repository.listByGame("game-1")).toEqual({
      ok: true,
      value: [due],
    });
    expect(await repository.listByTheme("one-move-threat")).toEqual({
      ok: true,
      value: [due, later],
    });
    expect(await repository.listDue("2026-11-26")).toEqual({
      ok: true,
      value: [due],
    });
  });

  it("roundtrips optional research scores and treats score changes as immutable conflicts", async () => {
    const databaseName = createDatabaseName();
    const repository = track(
      new IndexedDbReviewEvidenceRepository(databaseName),
    );
    const record: ReviewEvidenceRecord = {
      ...reviewEvidence("review-research"),
      originalAttemptScore: 75,
      closeTransferScore: 50,
      unlabeledTransferScore: null,
    };

    expect(await repository.put(record)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await repository.put(structuredClone(record))).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      await repository.put({ ...record, originalAttemptScore: 100 }),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
    await repository.close();

    const reloaded = track(new IndexedDbReviewEvidenceRepository(databaseName));
    expect(await reloaded.get(record.id)).toEqual({ ok: true, value: record });
  });

  it("preserves legacy records with research score fields absent", async () => {
    const databaseName = createDatabaseName();
    const repository = track(
      new IndexedDbReviewEvidenceRepository(databaseName),
    );
    const legacy = reviewEvidence("review-legacy");
    expect(await repository.put(legacy)).toEqual({
      ok: true,
      value: undefined,
    });
    await repository.close();

    const reloaded = track(new IndexedDbReviewEvidenceRepository(databaseName));
    const result = await reloaded.get(legacy.id);
    expect(result).toEqual({ ok: true, value: legacy });
    if (result.ok && result.value !== null) {
      expect("originalAttemptScore" in result.value).toBe(false);
      expect("closeTransferScore" in result.value).toBe(false);
      expect("unlabeledTransferScore" in result.value).toBe(false);
    }
  });

  it("rejects out-of-bounds and non-integer research scores", async () => {
    const repository = track(
      new IndexedDbReviewEvidenceRepository(createDatabaseName()),
    );
    expect(
      await repository.put({
        ...reviewEvidence("invalid-original"),
        originalAttemptScore: 101,
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid-record" } });
    expect(
      await repository.put({
        ...reviewEvidence("invalid-close"),
        closeTransferScore: -1,
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid-record" } });
    expect(
      await repository.put({
        ...reviewEvidence("invalid-unlabeled"),
        unlabeledTransferScore: 50.5,
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid-record" } });
  });

  it("rejects invalid analysis and review records before persistence", async () => {
    const analyses = track(
      new IndexedDbAnalysisRepository(createDatabaseName()),
    );
    const evidence = track(
      new IndexedDbReviewEvidenceRepository(createDatabaseName()),
    );
    const invalidAnalysis = { ...analysisRecord(), analyzedPlayerMoves: 2 };
    const invalidEvidence = { ...reviewEvidence(), dueReview: "tomorrow" };

    expect(await analyses.put(invalidAnalysis)).toMatchObject({
      ok: false,
      error: { code: "invalid-record" },
    });
    expect(await evidence.put(invalidEvidence)).toMatchObject({
      ok: false,
      error: { code: "invalid-record" },
    });
  });
});
