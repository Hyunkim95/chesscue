import { tutorGameMode, type GameRecord } from "../../domain/game/types";
import { updateStandings, withRaceHistory } from "./race-history";
import {
  doc,
  runTransaction,
  type Transaction,
  type Firestore,
} from "firebase/firestore";
import {
  CloudRecordConflict,
  decodeDocument,
  digest,
  recordId,
  serialized,
  type AccountRecord,
} from "./account-records";

export async function createAccountRecord(
  firestore: Firestore,
  uid: string,
  item: AccountRecord,
  active = () => true,
) {
  const id = recordId(item);
  const reference = doc(firestore, "users", uid, item.kind, id);
  const content = serialized(item);
  const contentHash = await digest(content);
  const write = async (
    transaction: Transaction,
    games?: readonly GameRecord[],
  ) => {
    if (!active()) throw new Error("Session ended");
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) {
      const existing = await decodeDocument(
        item.kind,
        id,
        uid,
        snapshot.data(),
      );
      if (serialized(existing) !== content)
        throw new CloudRecordConflict("Immutable record conflict");
      return "already-present" as const;
    }
    if (games && item.kind === "games")
      await updateStandings(firestore, uid, transaction, [
        ...games,
        item.value,
      ]);
    transaction.set(reference, {
      ownerId: uid,
      contentHash,
      createdAt: new Date().toISOString(),
      record: item.value,
    });
    return "created" as const;
  };
  if (item.kind === "games" && tutorGameMode(item.value) === "rated") {
    const game = item.value;
    return withRaceHistory(firestore, uid, async (tx, games) => {
      const result = await write(tx, games);
      return result === "created"
        ? { result, changed: true, added: game }
        : { result, changed: false };
    });
  }
  return runTransaction(firestore, write);
}
