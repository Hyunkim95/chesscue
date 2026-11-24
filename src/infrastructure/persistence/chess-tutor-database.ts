import { deleteDB, type DBSchema, type IDBPDatabase, openDB } from "idb";

import type { AnalysisRecord } from "../../application/ports/analysis-repository";
import type { ReviewEvidenceRecord } from "../../application/ports/review-evidence-repository";
import type { LearningTheme } from "../../domain/analysis/types";
import type { GameRecord } from "../../domain/game/types";

export const DATABASE_VERSION = 2;
export const GAME_STORE = "games";
export const ANALYSIS_STORE = "analyses";
export const REVIEW_EVIDENCE_STORE = "reviewEvidence";

export interface ChessTutorDatabase extends DBSchema {
  games: {
    key: string;
    value: GameRecord;
  };
  analyses: {
    key: string;
    value: AnalysisRecord;
    indexes: { "by-game-id": string };
  };
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

export const openChessTutorDatabase = (
  databaseName: string,
): Promise<IDBPDatabase<ChessTutorDatabase>> =>
  openDB<ChessTutorDatabase>(databaseName, DATABASE_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1 && !database.objectStoreNames.contains(GAME_STORE)) {
        database.createObjectStore(GAME_STORE, { keyPath: "id" });
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
