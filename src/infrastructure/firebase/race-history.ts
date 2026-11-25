import {
  serverTimestamp,
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  runTransaction,
  type Transaction,
  type Firestore,
} from "firebase/firestore";
import { z } from "zod";
import {
  goalSchema,
  memberSchema,
  raceId,
  raceProgress,
} from "../../domain/race/elo-race";
import { ratingHistory } from "../../domain/game/rating";
import type { GameRecord } from "../../domain/game/types";
import { decodeDocument } from "./account-records";

interface Snapshot {
  uid: string;
  revision: string | null;
  games: readonly GameRecord[];
}
const cached = new WeakMap<Firestore, Snapshot>();
const revisionSchema = z.object({ revision: z.uuid() });
class Superseded extends Error {}

// A private revision changes in the same commit as each rated game or membership.
// On another device's write, reload the canonical history before retrying.
export async function withRaceHistory<T>(
  db: Firestore,
  uid: string,
  apply: (
    tx: Transaction,
    games: readonly GameRecord[],
  ) => Promise<{ result: T; added?: GameRecord; changed: boolean }>,
): Promise<T> {
  const version = doc(db, "users", uid, "raceState", "version");
  for (let attempt = 0; attempt < 5; attempt++) {
    const stamp = await getDocFromServer(version);
    const revision = stamp.exists()
      ? revisionSchema.parse(stamp.data()).revision
      : null;
    let snapshot = cached.get(db);
    if (snapshot?.uid !== uid || snapshot.revision !== revision) {
      const data = await getDocsFromServer(
        query(
          collection(db, "users", uid, "games"),
          where("record.origin.mode", "==", "rated"),
        ),
      );
      const games = await Promise.all(
        data.docs.map(async (d) => {
          const item = await decodeDocument("games", d.id, uid, d.data());
          if (item.kind !== "games") throw new Error("Invalid rated history.");
          return item.value;
        }),
      );
      snapshot = { uid, revision, games };
      cached.set(db, snapshot);
    }
    const { games } = snapshot;
    try {
      const next = crypto.randomUUID();
      const outcome = await runTransaction(db, async (tx) => {
        const current = await tx.get(version);
        if (
          (current.exists()
            ? revisionSchema.parse(current.data()).revision
            : null) !== revision
        )
          throw new Superseded();
        const update = await apply(tx, games);
        if (update.changed) tx.set(version, { revision: next });
        return update;
      });
      if (outcome.changed)
        cached.set(db, {
          uid,
          revision: next,
          games: outcome.added ? [...games, outcome.added] : games,
        });
      return outcome.result;
    } catch (e) {
      if (!(e instanceof Superseded)) throw e;
    }
  }
  throw new Error("Game history changed on another device. Retrying sync.");
}
export async function updateStandings(
  db: Firestore,
  uid: string,
  tx: Transaction,
  games: readonly GameRecord[],
  disputed = false,
) {
  const links = await getDocsFromServer(
    collection(db, "users", uid, "raceLinks"),
  );
  if (links.empty) return;
  const history = ratingHistory(games);
  const updates = await Promise.all(
    links.docs.map(async (link) => {
      const ref = doc(db, "races", raceId.parse(link.id), "members", uid);
      const member = memberSchema.parse((await tx.get(ref)).data());
      return {
        ref,
        data: {
          ...raceProgress(history, member, goalSchema.parse(link.get("goal"))),
          publishedAt: serverTimestamp(),
          disputed: member.disputed || disputed,
        },
      };
    }),
  );
  for (const { ref, data } of updates) tx.update(ref, data);
}
