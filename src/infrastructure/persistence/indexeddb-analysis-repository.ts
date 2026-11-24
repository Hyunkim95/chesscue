import type { IDBPDatabase } from "idb";

import type {
  AnalysisRecord,
  AnalysisRepository,
} from "../../application/ports/analysis-repository";
import type { RepositoryFailure } from "../../application/ports/game-repository";
import { err, ok, type Result } from "../../shared/result/result";

import {
  ANALYSIS_STORE,
  analysisRecordKey,
  type ChessTutorDatabase,
  openChessTutorDatabase,
} from "./chess-tutor-database";
import {
  isAnalysisRecord,
  serializeAnalysisRecord,
} from "./analysis-record-validation";

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "IndexedDB analysis operation failed.";

const sortAnalysisRecords = (
  records: readonly AnalysisRecord[],
): readonly AnalysisRecord[] =>
  records.toSorted((left, right) => {
    const gameComparison = left.gameId.localeCompare(right.gameId);
    return gameComparison === 0
      ? left.analysisVersion.localeCompare(right.analysisVersion)
      : gameComparison;
  });

export class IndexedDbAnalysisRepository implements AnalysisRepository {
  readonly #databaseName: string;
  #databasePromise: Promise<IDBPDatabase<ChessTutorDatabase>> | null = null;

  constructor(databaseName = "adaptive-chess-tutor") {
    this.#databaseName = databaseName;
  }

  async get(
    gameId: string,
    analysisVersion: string,
  ): Promise<Result<AnalysisRecord | null, RepositoryFailure>> {
    try {
      const database = await this.#open();
      const value: unknown = await database.get(
        ANALYSIS_STORE,
        analysisRecordKey(gameId, analysisVersion),
      );
      if (value === undefined) return ok(null);
      if (!isAnalysisRecord(value)) {
        return err({
          code: "invalid-record",
          message: `Stored analysis ${gameId}@${analysisVersion} failed runtime validation.`,
        });
      }
      return ok(structuredClone(value));
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async put(record: AnalysisRecord): Promise<Result<void, RepositoryFailure>> {
    if (!isAnalysisRecord(record)) {
      return err({
        code: "invalid-record",
        message: "Analysis record failed runtime validation.",
      });
    }

    try {
      const database = await this.#open();
      const key = analysisRecordKey(record.gameId, record.analysisVersion);
      const transaction = database.transaction(ANALYSIS_STORE, "readwrite");
      const storedValue: unknown = await transaction.store.get(key);
      if (storedValue !== undefined && !isAnalysisRecord(storedValue)) {
        await transaction.done;
        return err({
          code: "invalid-record",
          message: `Stored analysis ${record.gameId}@${record.analysisVersion} failed runtime validation.`,
        });
      }
      if (storedValue !== undefined) {
        await transaction.done;
        return serializeAnalysisRecord(storedValue) ===
          serializeAnalysisRecord(record)
          ? ok(undefined)
          : err({
              code: "conflict",
              message:
                "A different immutable analysis already exists for this game and version.",
            });
      }

      await transaction.store.add(structuredClone(record), key);
      await transaction.done;
      return ok(undefined);
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async listAll(): Promise<
    Result<readonly AnalysisRecord[], RepositoryFailure>
  > {
    try {
      const database = await this.#open();
      const values: readonly unknown[] = await database.getAll(ANALYSIS_STORE);
      return this.#validatedList(values);
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async listByGame(
    gameId: string,
  ): Promise<Result<readonly AnalysisRecord[], RepositoryFailure>> {
    try {
      const database = await this.#open();
      const values: readonly unknown[] = await database.getAllFromIndex(
        ANALYSIS_STORE,
        "by-game-id",
        gameId,
      );
      return this.#validatedList(values);
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async close(): Promise<void> {
    const databasePromise = this.#databasePromise;
    this.#databasePromise = null;
    if (databasePromise !== null) {
      const database = await databasePromise;
      database.close();
    }
  }

  #validatedList(
    values: readonly unknown[],
  ): Result<readonly AnalysisRecord[], RepositoryFailure> {
    if (!values.every(isAnalysisRecord)) {
      return err({
        code: "invalid-record",
        message: "At least one stored analysis failed runtime validation.",
      });
    }
    return ok(
      sortAnalysisRecords(values).map((record) => structuredClone(record)),
    );
  }

  #open(): Promise<IDBPDatabase<ChessTutorDatabase>> {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(
        new Error("IndexedDB is unavailable in this environment."),
      );
    }
    this.#databasePromise ??= openChessTutorDatabase(this.#databaseName);
    return this.#databasePromise;
  }
}
