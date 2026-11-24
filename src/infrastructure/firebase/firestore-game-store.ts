import { doc, runTransaction, type Firestore } from "firebase/firestore";

import type {
  RemoteGameStore,
  RemoteGameWriteResult,
  RemoteSyncFailure,
} from "../../application/sync-games/sync-ports";
import type { GameRecord } from "../../domain/game/types";
import { err, ok, type Result } from "../../shared/result/result";
import { serializeGameRecord } from "../persistence/game-record-validation";

import { isSyncedGameDocument, type SyncedGameDocument } from "./game-document";

class SyncConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncConflict";
  }
}

const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

const toFailure = (error: unknown): RemoteSyncFailure => {
  if (error instanceof SyncConflict) {
    return { code: "conflict", message: error.message };
  }
  const message =
    error instanceof Error
      ? error.message
      : "Firestore synchronization failed.";
  return { code: "unavailable", message };
};

export class FirestoreGameStore implements RemoteGameStore {
  readonly #firestore: Firestore;
  readonly #ownerId: string;

  constructor(firestore: Firestore, ownerId: string) {
    if (ownerId.length === 0) {
      throw new Error("A non-empty owner ID is required.");
    }
    this.#firestore = firestore;
    this.#ownerId = ownerId;
  }

  async createIfAbsent(
    record: GameRecord,
  ): Promise<Result<RemoteGameWriteResult, RemoteSyncFailure>> {
    try {
      const contentHash = await sha256(serializeGameRecord(record));
      const reference = doc(
        this.#firestore,
        "users",
        this.#ownerId,
        "games",
        record.id,
      );
      const result = await runTransaction(
        this.#firestore,
        async (transaction) => {
          const snapshot = await transaction.get(reference);
          if (snapshot.exists()) {
            const existing: unknown = snapshot.data();
            if (!isSyncedGameDocument(existing)) {
              throw new SyncConflict(
                "The existing cloud game record is invalid.",
              );
            }
            if (
              existing.ownerId !== this.#ownerId ||
              existing.contentHash !== contentHash
            ) {
              throw new SyncConflict(
                "The cloud game ID already contains different immutable data.",
              );
            }
            return "already-present" as const;
          }

          const document: SyncedGameDocument = {
            ownerId: this.#ownerId,
            contentHash,
            record: structuredClone(record),
            createdAt: new Date().toISOString(),
          };
          transaction.set(reference, document);
          return "created" as const;
        },
      );
      return ok(result);
    } catch (error: unknown) {
      return err(toFailure(error));
    }
  }
}
