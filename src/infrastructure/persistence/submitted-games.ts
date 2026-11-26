import { openDB, type DBSchema } from "idb";
import { digest } from "../firebase/account-records";

interface Submissions extends DBSchema {
  pending: { key: string; value: string };
}
const openQueue = () =>
  openDB<Submissions>("chesscue-pgn-submissions", 1, {
    upgrade(db) {
      db.createObjectStore("pending");
    },
  });
const queued = "chesscue-submitted-pgn";

export async function queueSubmittedGames(games: readonly string[]) {
  if (!games.length) return;
  const entries = await Promise.all(
    [...new Set(games)].map(async (pgn) => ({ id: await digest(pgn), pgn })),
  );
  const db = await openQueue();
  try {
    const tx = db.transaction("pending", "readwrite");
    await Promise.all([
      ...entries.map(({ id, pgn }) => tx.store.put(pgn, id)),
      tx.done,
    ]);
  } finally {
    db.close();
  }
  window.dispatchEvent(new Event(queued));
}

export function startSubmissionSync() {
  const controller = new AbortController();
  async function flush() {
    if (!navigator.onLine || controller.signal.aborted) return;
    await navigator.locks.request(
      queued,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return;
        const db = await openQueue();
        try {
          while (!controller.signal.aborted && navigator.onLine) {
            const cursor = await db.transaction("pending").store.openCursor();
            if (!cursor) break;
            const { submitPgn } = await import("../firebase/submit-pgn");
            await submitPgn(cursor.key, cursor.value);
            await db.delete("pending", cursor.key);
          }
        } finally {
          db.close();
        }
      },
    );
  }
  const retry = () => {
    void flush().catch(() => {
      /* The unacknowledged PGN stays queued for retry. */
    });
  };
  window.addEventListener(queued, retry);
  window.addEventListener("online", retry);
  const timer = window.setInterval(retry, 30_000);
  retry();
  return () => {
    controller.abort();
    window.removeEventListener(queued, retry);
    window.removeEventListener("online", retry);
    window.clearInterval(timer);
  };
}
