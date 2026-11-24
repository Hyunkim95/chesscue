import type { IDBPDatabase } from "idb";

import type { RepositoryFailure } from "../../application/ports/game-repository";
import type {
  ReviewEvidenceRecord,
  ReviewEvidenceRepository,
} from "../../application/ports/review-evidence-repository";
import type { LearningTheme } from "../../domain/analysis/types";
import { err, ok, type Result } from "../../shared/result/result";

import {
  type ChessTutorDatabase,
  openChessTutorDatabase,
  REVIEW_EVIDENCE_STORE,
} from "./chess-tutor-database";
import {
  isDueReviewDate,
  isReviewEvidenceRecord,
  serializeReviewEvidenceRecord,
} from "./review-evidence-validation";

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "IndexedDB review evidence operation failed.";

const sortEvidence = (
  records: readonly ReviewEvidenceRecord[],
): readonly ReviewEvidenceRecord[] =>
  records.toSorted((left, right) => {
    const completedComparison = left.completedAt.localeCompare(
      right.completedAt,
    );
    return completedComparison === 0
      ? left.id.localeCompare(right.id)
      : completedComparison;
  });

export class IndexedDbReviewEvidenceRepository implements ReviewEvidenceRepository {
  readonly #databaseName: string;
  #databasePromise: Promise<IDBPDatabase<ChessTutorDatabase>> | null = null;

  constructor(databaseName = "adaptive-chess-tutor") {
    this.#databaseName = databaseName;
  }

  async get(
    id: string,
  ): Promise<Result<ReviewEvidenceRecord | null, RepositoryFailure>> {
    try {
      const database = await this.#open();
      const value: unknown = await database.get(REVIEW_EVIDENCE_STORE, id);
      if (value === undefined) return ok(null);
      if (!isReviewEvidenceRecord(value)) {
        return err({
          code: "invalid-record",
          message: `Stored review evidence ${id} failed runtime validation.`,
        });
      }
      return ok(structuredClone(value));
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async put(
    record: ReviewEvidenceRecord,
  ): Promise<Result<void, RepositoryFailure>> {
    if (!isReviewEvidenceRecord(record)) {
      return err({
        code: "invalid-record",
        message: "Review evidence record failed runtime validation.",
      });
    }

    try {
      const database = await this.#open();
      const transaction = database.transaction(
        REVIEW_EVIDENCE_STORE,
        "readwrite",
      );
      const storedValue: unknown = await transaction.store.get(record.id);
      if (storedValue !== undefined && !isReviewEvidenceRecord(storedValue)) {
        await transaction.done;
        return err({
          code: "invalid-record",
          message: `Stored review evidence ${record.id} failed runtime validation.`,
        });
      }
      if (storedValue !== undefined) {
        await transaction.done;
        return serializeReviewEvidenceRecord(storedValue) ===
          serializeReviewEvidenceRecord(record)
          ? ok(undefined)
          : err({
              code: "conflict",
              message:
                "A different immutable review record already exists for this ID.",
            });
      }

      await transaction.store.add(structuredClone(record));
      await transaction.done;
      return ok(undefined);
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async listAll(): Promise<
    Result<readonly ReviewEvidenceRecord[], RepositoryFailure>
  > {
    try {
      const database = await this.#open();
      const values: readonly unknown[] = await database.getAll(
        REVIEW_EVIDENCE_STORE,
      );
      return this.#validatedList(values);
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async listByGame(
    gameId: string,
  ): Promise<Result<readonly ReviewEvidenceRecord[], RepositoryFailure>> {
    return this.#listFromIndex("by-game-id", gameId);
  }

  async listByTheme(
    theme: LearningTheme,
  ): Promise<Result<readonly ReviewEvidenceRecord[], RepositoryFailure>> {
    return this.#listFromIndex("by-theme", theme);
  }

  async listDue(
    onOrBefore: string,
  ): Promise<Result<readonly ReviewEvidenceRecord[], RepositoryFailure>> {
    if (!isDueReviewDate(onOrBefore)) {
      return err({
        code: "invalid-record",
        message: "Due review boundary must use YYYY-MM-DD.",
      });
    }
    try {
      const database = await this.#open();
      const values: readonly unknown[] = await database.getAllFromIndex(
        REVIEW_EVIDENCE_STORE,
        "by-due-review",
        IDBKeyRange.upperBound(onOrBefore),
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

  async #listFromIndex(
    index: "by-game-id" | "by-theme",
    value: string,
  ): Promise<Result<readonly ReviewEvidenceRecord[], RepositoryFailure>> {
    try {
      const database = await this.#open();
      const values: readonly unknown[] = await database.getAllFromIndex(
        REVIEW_EVIDENCE_STORE,
        index,
        value,
      );
      return this.#validatedList(values);
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  #validatedList(
    values: readonly unknown[],
  ): Result<readonly ReviewEvidenceRecord[], RepositoryFailure> {
    if (!values.every(isReviewEvidenceRecord)) {
      return err({
        code: "invalid-record",
        message:
          "At least one stored review evidence record failed runtime validation.",
      });
    }
    return ok(sortEvidence(values).map((record) => structuredClone(record)));
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
