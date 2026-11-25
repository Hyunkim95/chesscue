import type { IDBPDatabase } from "idb";

import type {
  GameRepository,
  RepositoryFailure,
} from "../../application/ports/game-repository";
import {
  tutorGameMode,
  type GameId,
  type GameRecord,
  type TutorGameMode,
} from "../../domain/game/types";
import { err, ok, type Result } from "../../shared/result/result";

import {
  type ChessTutorDatabase,
  GAME_STORE,
  openChessTutorDatabase,
} from "./chess-tutor-database";
import { isGameRecord } from "./game-record-validation";
import { decideGameWrite } from "./write-policy";

export { deleteChessTutorDatabase } from "./chess-tutor-database";

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "IndexedDB operation failed.";

export class IndexedDbGameRepository implements GameRepository {
  readonly #databaseName: string;
  #databasePromise: Promise<IDBPDatabase<ChessTutorDatabase>> | null = null;

  constructor(databaseName = "adaptive-chess-tutor") {
    this.#databaseName = databaseName;
  }

  async get(id: GameId): Promise<Result<GameRecord | null, RepositoryFailure>> {
    try {
      const database = await this.#open();
      const value: unknown = await database.get(GAME_STORE, id);

      if (value === undefined) {
        return ok(null);
      }

      if (!isGameRecord(value)) {
        return err({
          code: "invalid-record",
          message: `Stored game ${id} does not match schema version 1.`,
        });
      }

      return ok(structuredClone(value));
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async put(record: GameRecord): Promise<Result<void, RepositoryFailure>> {
    if (!isGameRecord(record)) {
      return err({
        code: "invalid-record",
        message: "Game record failed schema validation.",
      });
    }

    try {
      const database = await this.#open();
      const transaction = database.transaction(GAME_STORE, "readwrite");
      const storedValue: unknown = await transaction.store.get(record.id);

      if (storedValue !== undefined && !isGameRecord(storedValue)) {
        await transaction.done;
        return err({
          code: "invalid-record",
          message: `Stored game ${record.id} does not match schema version 1.`,
        });
      }

      const decision = decideGameWrite(storedValue, record);
      if (decision.type === "conflict") {
        await transaction.done;
        return err({ code: "conflict", message: decision.reason });
      }

      if (decision.type !== "idempotent") {
        await transaction.store.put(structuredClone(record));
      }

      await transaction.done;
      return ok(undefined);
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async getLatestInProgress(
    mode?: TutorGameMode,
  ): Promise<Result<GameRecord | null, RepositoryFailure>> {
    try {
      const database = await this.#open();
      const values: readonly unknown[] = await database.getAll(GAME_STORE);
      if (!values.every(isGameRecord)) {
        return err({
          code: "invalid-record",
          message: "At least one stored game does not match schema version 1.",
        });
      }
      const latest = values
        .filter(
          (record) =>
            record.origin.type === "tutor" &&
            (mode === undefined ||
              (tutorGameMode(record) ?? "rated") === mode) &&
            record.completedAt === null &&
            record.result === null,
        )
        .toSorted((left, right) => {
          const time = right.createdAt.localeCompare(left.createdAt);
          return time === 0 ? right.id.localeCompare(left.id) : time;
        })[0];
      return ok(latest === undefined ? null : structuredClone(latest));
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async listCompleted(): Promise<
    Result<readonly GameRecord[], RepositoryFailure>
  > {
    try {
      const database = await this.#open();
      const values: readonly unknown[] = await database.getAll(GAME_STORE);
      if (!values.every(isGameRecord)) {
        return err({
          code: "invalid-record",
          message: "At least one stored game does not match schema version 1.",
        });
      }

      const completed = values
        .filter((record) => record.completedAt !== null)
        .sort((left, right) => {
          const completedComparison = (left.completedAt ?? "").localeCompare(
            right.completedAt ?? "",
          );
          return completedComparison === 0
            ? left.id.localeCompare(right.id)
            : completedComparison;
        })
        .map((record) => structuredClone(record));

      return ok(completed);
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
