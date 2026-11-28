import type { IDBPDatabase } from "idb";

import {
  tutorGameMode,
  type GameId,
  type GameRecord,
  type TutorGameMode,
} from "../../domain/game/types";
import type {
  CompletedGamePages,
  GamePageCursor,
  GameRepository,
  RepositoryFailure,
} from "../../application/ports/game-repository";
import { err, ok, type Result } from "../../shared/result/result";

import {
  type ChessTutorDatabase,
  GAME_ORDER_INDEX,
  GAME_ORDER_STORE,
  GAME_STORE,
  gameOrderEntry,
  openChessTutorDatabase,
} from "./chess-tutor-database";
import { isGameRecord } from "./game-record-validation";
import { decideGameWrite } from "./write-policy";

export { deleteChessTutorDatabase } from "./chess-tutor-database";

// Games written outside put (a sync, an older import or a test seed) still
// join the order index. Keys only, so this stays cheap for long histories.
async function indexMissingGames(
  database: IDBPDatabase<ChessTutorDatabase>,
): Promise<void> {
  const transaction = database.transaction(
    [GAME_STORE, GAME_ORDER_STORE],
    "readwrite",
  );
  const games = transaction.objectStore(GAME_STORE);
  const order = transaction.objectStore(GAME_ORDER_STORE);
  const indexed = new Set(await order.getAllKeys());
  for (const id of await games.getAllKeys()) {
    if (indexed.has(id)) continue;
    const value: unknown = await games.get(id);
    const entry = isGameRecord(value) ? gameOrderEntry(value) : null;
    if (entry) await order.put(entry);
  }
  await transaction.done;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "IndexedDB operation failed.";

export class IndexedDbGameRepository
  implements GameRepository, CompletedGamePages
{
  readonly #databaseName: string;
  #databasePromise: Promise<IDBPDatabase<ChessTutorDatabase>> | null = null;
  #orderChecked: Promise<void> | null = null;

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

  async put(
    record: GameRecord,
    policy: "update-local" | "insert-only" = "update-local",
  ): Promise<Result<void, RepositoryFailure>> {
    if (!isGameRecord(record)) {
      return err({
        code: "invalid-record",
        message: "Game record failed schema validation.",
      });
    }

    try {
      const database = await this.#open();
      const transaction = database.transaction(
        [GAME_STORE, GAME_ORDER_STORE, "syncReceipts"],
        "readwrite",
      );
      const storedValue: unknown = await transaction
        .objectStore(GAME_STORE)
        .get(record.id);

      if (storedValue !== undefined && !isGameRecord(storedValue)) {
        await transaction.done;
        return err({
          code: "invalid-record",
          message: `Stored game ${record.id} does not match schema version 1.`,
        });
      }

      const decision = decideGameWrite(storedValue, record);
      if (decision.type === "replace-in-progress" && policy === "insert-only") {
        await transaction.done;
        return err({
          code: "conflict",
          message:
            "An unfinished game with this ID already exists on this device.",
        });
      }
      if (decision.type === "conflict") {
        await transaction.done;
        return err({ code: "conflict", message: decision.reason });
      }

      if (decision.type !== "idempotent") {
        await transaction.objectStore(GAME_STORE).put(structuredClone(record));
        const entry = gameOrderEntry(record);
        if (entry) await transaction.objectStore(GAME_ORDER_STORE).put(entry);
        if (record.completedAt !== null)
          await transaction
            .objectStore("syncReceipts")
            .put({ queuedAt: Date.now(), acknowledgedAt: null }, record.id);
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
            (mode === undefined || tutorGameMode(record) === mode) &&
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
    const all = await this.listCompletedSources();
    if (!all.ok) return all;
    const seen = new Set<string>();
    return ok(
      all.value.filter((game) => {
        if (game.fingerprint === null) return true;
        if (seen.has(game.fingerprint)) return false;
        seen.add(game.fingerprint);
        return true;
      }),
    );
  }

  async listCompletedPage(
    after: GamePageCursor | null,
    limit: number,
  ): Promise<
    Result<
      {
        readonly games: readonly GameRecord[];
        readonly next: GamePageCursor | null;
      },
      RepositoryFailure
    >
  > {
    try {
      const database = await this.#open();
      // A failed repair leaves the list as indexed; the next session retries.
      this.#orderChecked ??= indexMissingGames(database).catch(() => undefined);
      await this.#orderChecked;
      const transaction = database.transaction([GAME_ORDER_STORE, GAME_STORE]);
      const index = transaction
        .objectStore(GAME_ORDER_STORE)
        .index(GAME_ORDER_INDEX);
      const entries: GamePageCursor[] = [];
      let cursor = await index.openCursor(
        after === null
          ? null
          : IDBKeyRange.upperBound([after.order, after.id], true),
        "prev",
      );
      while (cursor && entries.length < limit) {
        entries.push({ order: cursor.value.order, id: cursor.value.id });
        cursor = await cursor.continue();
      }
      const games: GameRecord[] = [];
      for (const { id } of entries) {
        const value: unknown = await transaction
          .objectStore(GAME_STORE)
          .get(id);
        if (!isGameRecord(value))
          return err({
            code: "invalid-record",
            message: `Stored game ${id} does not match schema version 1.`,
          });
        games.push(structuredClone(value));
      }
      await transaction.done;
      return ok({
        games,
        next: entries.length === limit ? (entries.at(-1) ?? null) : null,
      });
    } catch (error: unknown) {
      return err({ code: "unavailable", message: errorMessage(error) });
    }
  }

  async listCompletedSources(): Promise<
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
