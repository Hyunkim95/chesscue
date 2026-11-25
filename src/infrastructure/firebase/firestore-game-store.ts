import { type Firestore } from "firebase/firestore";

import type {
  RemoteGameStore,
  RemoteGameWriteResult,
  RemoteSyncFailure,
} from "../../application/sync-games/sync-ports";
import type { GameRecord } from "../../domain/game/types";
import { err, ok, type Result } from "../../shared/result/result";
import { createAccountRecord } from "./write-account-record";
import { CloudRecordConflict } from "./account-records";

const toFailure = (error: unknown): RemoteSyncFailure => {
  if (error instanceof CloudRecordConflict) {
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
      const result = await createAccountRecord(this.#firestore, this.#ownerId, {
        kind: "games",
        value: record,
      });
      return ok(result);
    } catch (error: unknown) {
      return err(toFailure(error));
    }
  }
}
