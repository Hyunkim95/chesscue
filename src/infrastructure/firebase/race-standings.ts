import { collection, onSnapshot, type Firestore } from "firebase/firestore";
import * as rest from "firebase/firestore/lite";
import { z } from "zod";
import { memberSchema, raceId } from "../../domain/race/elo-race";

export const standingSchema = memberSchema.extend({ uid: z.string().min(1) });
export type Standing = z.infer<typeof standingSchema>;
const timeSchema = z.object({
  seconds: z.number().int(),
  nanoseconds: z.number().int(),
});
interface Row {
  standing: Standing;
  time: rest.Timestamp | null;
}
const connected = new WeakSet<object>();
const refreshMs = 2000;

// A watch can stall while the browser stays online. A foreground-only REST query
// checks recent commits on an independent transport, using the same Auth and rules.
export function listenStandings(
  db: Firestore,
  id: string,
  next: (rows: Standing[]) => void,
  fail: () => void,
) {
  const members = collection(db, "races", raceId.parse(id), "members");
  const client = rest.getFirestore(db.app);
  if (
    import.meta.env.VITE_ACCOUNT_EMULATORS === "true" &&
    db.app.options.projectId?.startsWith("demo-") &&
    location.hostname === "127.0.0.1" &&
    !connected.has(client)
  ) {
    rest.connectFirestoreEmulator(client, "127.0.0.1", 8080);
    connected.add(client);
  }
  const feed = rest.collection(client, members.path);
  const rows = new Map<string, Row>();
  let newest: rest.Timestamp | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false,
    reading = false;
  const active = () => !stopped;
  function merge(docs: readonly { id: string; data: () => unknown }[]) {
    let changed = false;
    for (const d of docs) {
      const raw = z
        .object({ publishedAt: timeSchema.nullish() })
        .parse(d.data()).publishedAt;
      const time = raw
        ? new rest.Timestamp(raw.seconds, raw.nanoseconds)
        : null;
      const prior = rows.get(d.id);
      if (prior?.time && (!time || time.valueOf() < prior.time.valueOf()))
        continue;
      const standing = { ...memberSchema.parse(d.data()), uid: d.id };
      if (!prior || JSON.stringify(prior.standing) !== JSON.stringify(standing))
        changed = true;
      rows.set(d.id, { standing, time });
      if (time && (!newest || time.valueOf() > newest.valueOf())) newest = time;
    }
    if (changed) next(Array.from(rows.values(), (r) => r.standing));
  }
  function schedule() {
    clearTimeout(timer);
    if (
      !stopped &&
      !reading &&
      navigator.onLine &&
      document.visibilityState === "visible"
    )
      timer = setTimeout(() => {
        void refresh();
      }, refreshMs);
  }
  async function refresh() {
    if (
      stopped ||
      reading ||
      !navigator.onLine ||
      document.visibilityState !== "visible"
    )
      return;
    reading = true;
    try {
      const result = await rest.getDocs(
        newest
          ? rest.query(feed, rest.where("publishedAt", ">=", newest))
          : feed,
      );
      if (active()) merge(result.docs);
    } catch (error) {
      if (
        active() &&
        error instanceof Error &&
        "code" in error &&
        error.code === "permission-denied"
      )
        fail();
    } finally {
      reading = false;
      schedule();
    }
  }
  const unsubscribe = onSnapshot(
    members,
    { includeMetadataChanges: true },
    (snap) => {
      if (snap.metadata.fromCache || snap.metadata.hasPendingWrites || stopped)
        return;
      try {
        merge(snap.docs);
        schedule();
      } catch {
        fail();
      }
    },
    fail,
  );
  document.addEventListener("visibilitychange", schedule);
  window.addEventListener("online", schedule);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    document.removeEventListener("visibilitychange", schedule);
    window.removeEventListener("online", schedule);
  };
}
