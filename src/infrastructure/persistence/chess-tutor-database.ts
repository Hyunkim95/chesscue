import {
  deleteDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  openDB,
  type StoreNames,
} from "idb";

import type { AnalysisRecord } from "../../application/ports/analysis-repository";
import type { ReviewEvidenceRecord } from "../../application/ports/review-evidence-repository";
import type { LearningTheme } from "../../domain/analysis/types";
import { playedOrder } from "../../domain/game/played-order";
import type { GameRecord } from "../../domain/game/types";
import type { MomentAttemptRecord } from "../../domain/progress/types";

import type { ReviewMistake } from "../../domain/analysis/review-mistake";
import { isGameRecord } from "./game-record-validation";

export const DATABASE_VERSION = 6;
export const GAME_STORE = "games";
export const ANALYSIS_STORE = "analyses";
export const REVIEW_EVIDENCE_STORE = "reviewEvidence";
export const MOMENT_ATTEMPT_STORE = "momentAttempts";
// Completed games by when they were played, so Games reads one page at a time.
// Derived from the games store and rebuilt from it by the version 6 upgrade.
export const GAME_ORDER_STORE = "gameOrder";
export const GAME_ORDER_INDEX = "by-played";

export interface GameOrderEntry {
  readonly id: string;
  readonly order: number;
}

export function gameOrderEntry(record: GameRecord): GameOrderEntry | null {
  const order = playedOrder(record);
  return order === null ? null : { id: record.id, order };
}

export interface ChessTutorDatabase extends DBSchema {
  guestClaims: { key: string; value: { uid: string; copied: boolean } };
  syncReceipts: {
    key: string;
    value: { queuedAt: number; acknowledgedAt: number | null };
  };
  games: {
    key: string;
    value: GameRecord;
  };
  gameOrder: {
    key: string;
    value: GameOrderEntry;
    indexes: { "by-played": [number, string] };
  };
  analyses: {
    key: string;
    value: AnalysisRecord;
    indexes: { "by-game-id": string };
  };
  reviewMistakes: { key: string; value: ReviewMistake };
  momentAttempts: { key: string; value: MomentAttemptRecord };
  reviewEvidence: {
    key: string;
    value: ReviewEvidenceRecord;
    indexes: {
      "by-game-id": string;
      "by-theme": LearningTheme;
      "by-due-review": string;
    };
  };
}

export const analysisRecordKey = (
  gameId: string,
  analysisVersion: string,
): string => JSON.stringify([gameId, analysisVersion]);

async function indexSavedGames(
  transaction: IDBPTransaction<
    ChessTutorDatabase,
    ArrayLike<StoreNames<ChessTutorDatabase>>,
    "versionchange"
  >,
) {
  const order = transaction.objectStore(GAME_ORDER_STORE);
  let cursor = await transaction.objectStore(GAME_STORE).openCursor();
  while (cursor) {
    const value: unknown = cursor.value;
    const entry = isGameRecord(value) ? gameOrderEntry(value) : null;
    if (entry) await order.put(entry);
    cursor = await cursor.continue();
  }
}

export const openChessTutorDatabase = (
  databaseName: string,
): Promise<IDBPDatabase<ChessTutorDatabase>> =>
  openDB<ChessTutorDatabase>(databaseName, DATABASE_VERSION, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 5) {
        database.createObjectStore(MOMENT_ATTEMPT_STORE, { keyPath: "id" });
      }
      if (oldVersion < 4) {
        database.createObjectStore("reviewMistakes", { keyPath: "id" });
      }
      if (oldVersion < 3) {
        database.createObjectStore("guestClaims");
        database.createObjectStore("syncReceipts");
      }
      if (oldVersion < 1 && !database.objectStoreNames.contains(GAME_STORE)) {
        database.createObjectStore(GAME_STORE, { keyPath: "id" });
      }

      if (oldVersion < 6) {
        const order = database.createObjectStore(GAME_ORDER_STORE, {
          keyPath: "id",
        });
        order.createIndex(GAME_ORDER_INDEX, ["order", "id"]);
        // Existing histories: index every completed game already saved. The
        // upgrade transaction stays open while these requests run.
        if (database.objectStoreNames.contains(GAME_STORE))
          void indexSavedGames(transaction);
      }

      if (oldVersion < 2) {
        if (!database.objectStoreNames.contains(ANALYSIS_STORE)) {
          const analyses = database.createObjectStore(ANALYSIS_STORE);
          analyses.createIndex("by-game-id", "gameId");
        }
        if (!database.objectStoreNames.contains(REVIEW_EVIDENCE_STORE)) {
          const reviewEvidence = database.createObjectStore(
            REVIEW_EVIDENCE_STORE,
            {
              keyPath: "id",
            },
          );
          reviewEvidence.createIndex("by-game-id", "gameId");
          reviewEvidence.createIndex("by-theme", "theme");
          reviewEvidence.createIndex("by-due-review", "dueReview");
        }
      }
    },
  });

export const deleteChessTutorDatabase = async (
  databaseName: string,
): Promise<void> => {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is unavailable in this environment.");
  }
  await deleteDB(databaseName);
};
