import type { IDBPDatabase } from "idb";

import type { RepositoryFailure } from "../../application/ports/game-repository";
import type { MomentAttemptRepository } from "../../application/ports/moment-attempt-repository";
import type { MomentAttemptRecord } from "../../domain/progress/types";
import { err, ok, type Result } from "../../shared/result/result";
import {
  type ChessTutorDatabase,
  MOMENT_ATTEMPT_STORE,
  openChessTutorDatabase,
} from "./chess-tutor-database";
import { parseMomentAttemptRecord } from "./moment-attempt-validation";

const failure = (error: unknown): RepositoryFailure => ({
  code: "unavailable",
  message:
    error instanceof Error
      ? error.message
      : "IndexedDB moment attempt operation failed.",
});

export class IndexedDbMomentAttemptRepository implements MomentAttemptRepository {
  readonly #databaseName: string;
  #database: Promise<IDBPDatabase<ChessTutorDatabase>> | null = null;

  constructor(databaseName = "adaptive-chess-tutor") {
    this.#databaseName = databaseName;
  }

  async add(
    record: MomentAttemptRecord,
  ): Promise<Result<void, RepositoryFailure>> {
    const checked = parseMomentAttemptRecord(record);
    if (!checked)
      return err({
        code: "invalid-record",
        message: `Moment attempt ${record.id} failed runtime validation.`,
      });
    try {
      const database = await this.#open();
      const transaction = database.transaction(
        MOMENT_ATTEMPT_STORE,
        "readwrite",
      );
      const existing: unknown = await transaction.store.get(checked.id);
      if (existing !== undefined) {
        await transaction.done;
        return JSON.stringify(parseMomentAttemptRecord(existing)) ===
          JSON.stringify(checked)
          ? ok(undefined)
          : err({
              code: "conflict",
              message: `Moment attempt ${checked.id} is already stored with different content.`,
            });
      }
      await transaction.store.add(structuredClone(checked));
      await transaction.done;
      return ok(undefined);
    } catch (error) {
      return err(failure(error));
    }
  }

  async listAll(): Promise<
    Result<readonly MomentAttemptRecord[], RepositoryFailure>
  > {
    try {
      const database = await this.#open();
      const values: readonly unknown[] =
        await database.getAll(MOMENT_ATTEMPT_STORE);
      const records: MomentAttemptRecord[] = [];
      for (const value of values) {
        const record = parseMomentAttemptRecord(value);
        if (!record)
          return err({
            code: "invalid-record",
            message: "A stored moment attempt failed runtime validation.",
          });
        records.push(record);
      }
      return ok(
        records.toSorted(
          (a, b) =>
            a.completedAt.localeCompare(b.completedAt) ||
            a.id.localeCompare(b.id),
        ),
      );
    } catch (error) {
      return err(failure(error));
    }
  }

  close(): void {
    void this.#database?.then((database) => {
      database.close();
    });
    this.#database = null;
  }

  #open(): Promise<IDBPDatabase<ChessTutorDatabase>> {
    this.#database ??= openChessTutorDatabase(this.#databaseName);
    return this.#database;
  }
}
