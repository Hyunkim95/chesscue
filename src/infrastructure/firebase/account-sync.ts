import { updateStandings, withRaceHistory } from "./race-history";
import { createAccountRecord } from "./write-account-record";
import {
  collection,
  doc,
  onSnapshot,
  type Firestore,
} from "firebase/firestore";
import {
  CloudRecordConflict,
  decodeDocument,
  kinds,
  localRecords,
  recordId,
  saveDownloaded,
  serialized,
  type AccountRecord,
} from "./account-records";
import type { PlayerHistory } from "../persistence/player-history";
import { tutorGameMode, type GameRecord } from "../../domain/game/types";
import type { AnalysisRecord } from "../../application/ports/analysis-repository";
import {
  analysisRecordKey,
  openChessTutorDatabase,
} from "../persistence/chess-tutor-database";

import {
  initialSync,
  type SyncStatus,
} from "../../application/sync-games/sync-status";

// Firestore listeners deliver the initial collection and then only changed documents.
// The durable local records also serve as the retry queue after a crash or disconnect.
export function startAccountSync(
  firestore: Firestore,
  uid: string,
  history: PlayerHistory,
  report: (state: SyncStatus) => void,
  changed: () => void,
) {
  let stopped = false,
    running = false,
    dirty = false,
    backoff = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ready = new Set<string>();
  const remote = new Map<
    string,
    {
      kind: AccountRecord["kind"];
      data: Promise<AccountRecord | null>;
    }
  >();
  const reportedConflicts = new Set<string>();
  const unavailable = new Set<string>();
  let status = { ...initialSync };
  const active = () => !stopped;
  const needsAnotherPass = () => dirty;
  function notify(update: Partial<SyncStatus>) {
    status = { ...status, ...update };
    if (!stopped) report(status);
  }
  function schedule(delay = 100) {
    if (stopped) return;
    if (running) {
      dirty = true;
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      void reconcile();
    }, delay);
  }
  async function reconcile() {
    if (stopped || running) return;
    running = true;
    dirty = false;
    let retry = false,
      modified = false;
    try {
      const records = await localRecords(history);
      const local = new Map(
        records.map((item) => [item.kind + "/" + recordId(item), item]),
      );
      const conflicts = new Set<string>();
      const acceptedGames = new Map<string, GameRecord>();
      const acceptedAnalyses = new Map<string, AnalysisRecord>();
      const acceptedReviews = new Set<string>();
      let pending = 0;
      const db = await openChessTutorDatabase(history.name);
      try {
        const receiptTx = db.transaction("syncReceipts");
        const [receiptIds, receipts] = await Promise.all([
          receiptTx.store.getAllKeys(),
          receiptTx.store.getAll(),
        ]);
        const acknowledged = new Map(
          receiptIds.map((id, i) => [id, receipts[i]]),
        );
        let lastAck = receipts.reduce<number | null>(
          (last, r, index) =>
            receiptIds[index]?.includes("/")
              ? last
              : Math.max(last ?? 0, r.acknowledgedAt ?? 0) || null,
          null,
        );
        const keys = new Set([...local.keys(), ...remote.keys()]);
        for (const kind of kinds)
          for (const key of keys) {
            if (!active()) return;
            if (!key.startsWith(kind + "/")) continue;
            const here = local.get(key);
            const there = remote.get(key);
            const receiptKey =
              kind === "games" ? key.slice("games/".length) : key;
            const receipt = acknowledged.get(receiptKey);
            if (
              !navigator.onLine ||
              !ready.has(kind) ||
              unavailable.has(kind)
            ) {
              if (here && !there && !receipt?.acknowledgedAt) pending++;
              continue;
            }
            const incoming = await there?.data;
            const item = here ?? incoming;
            if (
              !item ||
              (there && !incoming) ||
              (here && incoming && serialized(here) !== serialized(incoming))
            ) {
              conflicts.add(key);
              if (
                there &&
                !reportedConflicts.has(key) &&
                [here, incoming].some(
                  (r) =>
                    r?.kind === "games" && tutorGameMode(r.value) === "rated",
                )
              ) {
                try {
                  await withRaceHistory(firestore, uid, async (tx, games) => {
                    await updateStandings(firestore, uid, tx, games, true);
                    tx.set(
                      doc(firestore, "users", uid, "raceConflicts", receiptKey),
                      { disputed: true },
                    );
                    return { result: undefined, changed: true };
                  });
                  reportedConflicts.add(key);
                } catch {
                  retry = true;
                }
              }
              continue;
            }
            if (
              item.kind !== "games" &&
              !acceptedGames.has(item.value.gameId)
            ) {
              pending++;
              continue;
            }
            if (item.kind === "analyses") {
              const game = acceptedGames.get(item.value.gameId);
              if (
                !game ||
                !item.value.facts.every(
                  (f) =>
                    game.moves[f.ply - 1]?.uci === f.playedMoveUci &&
                    (f.ply === 1
                      ? game.initialFen
                      : game.moves[f.ply - 2]?.fenAfter) === f.fenBefore,
                )
              ) {
                conflicts.add(key);
                continue;
              }
            }
            if (item.kind === "reviews") {
              const analysis = acceptedAnalyses.get(
                analysisRecordKey(
                  item.value.gameId,
                  item.value.analysisVersion,
                ),
              );
              if (!analysis) {
                pending++;
                continue;
              }
              if (!analysis.facts.some((f) => f.theme === item.value.theme)) {
                conflicts.add(key);
                continue;
              }
            }
            if (
              item.kind === "practice" &&
              !acceptedReviews.has(item.value.id)
            ) {
              pending++;
              continue;
            }
            try {
              if (!there) {
                await createAccountRecord(firestore, uid, item, () => !stopped);
                if (!remote.has(key))
                  remote.set(key, { kind, data: Promise.resolve(item) });
              } else if (!here) {
                await saveDownloaded(history, item);
                modified = true;
              }
              if (!receipt?.acknowledgedAt) {
                const now = Date.now();
                const update = db.transaction("syncReceipts", "readwrite");
                const current = await update.store.get(receiptKey);
                const ack = current?.acknowledgedAt ?? now;
                if (!current?.acknowledgedAt)
                  await update.store.put(
                    { queuedAt: current?.queuedAt ?? now, acknowledgedAt: ack },
                    receiptKey,
                  );
                await update.done;
                if (kind === "games") lastAck = Math.max(lastAck ?? 0, ack);
              }
              if (item.kind === "games")
                acceptedGames.set(item.value.id, item.value);
              if (item.kind === "analyses")
                acceptedAnalyses.set(
                  analysisRecordKey(
                    item.value.gameId,
                    item.value.analysisVersion,
                  ),
                  item.value,
                );
              if (item.kind === "reviews") acceptedReviews.add(item.value.id);
            } catch (error) {
              if (error instanceof CloudRecordConflict) conflicts.add(key);
              else {
                pending++;
                retry = true;
              }
            }
          }
        const connected =
          navigator.onLine && ready.size === kinds.length && !unavailable.size;
        notify({
          pending,
          conflicts: [...conflicts],
          lastAck,
          message: !navigator.onLine
            ? "Offline. Games are saved on this device."
            : unavailable.size || retry
              ? "Sync interrupted. Retrying."
              : !connected
                ? "Connecting to cloud"
                : conflicts.size
                  ? "Some records need attention"
                  : pending
                    ? "Waiting for linked records"
                    : "Up to date",
        });
      } finally {
        db.close();
      }
    } catch {
      retry = true;
      notify({ message: "Sync interrupted. Retrying." });
    } finally {
      running = false;
      if (modified && active()) changed();
      backoff = retry ? Math.min(30000, backoff * 2) : 1000;
      schedule(retry ? backoff : needsAnotherPass() ? 100 : 30000);
    }
  }
  const unsubscribes = new Map<string, () => void>();
  function listen(kind: (typeof kinds)[number]) {
    unsubscribes.get(kind)?.();
    unsubscribes.set(
      kind,
      onSnapshot(
        collection(firestore, "users", uid, kind),
        { includeMetadataChanges: true },
        (snap) => {
          if (
            snap.metadata.fromCache ||
            snap.metadata.hasPendingWrites ||
            stopped
          )
            return;
          // A new listener starts from an empty query view.
          if (!ready.has(kind))
            for (const [key, entry] of remote)
              if (entry.kind === kind) remote.delete(key);
          const changes = ready.has(kind)
            ? snap.docChanges()
            : snap.docs.map((doc) => ({ type: "added", doc }));
          for (const change of changes) {
            const id = change.doc.id,
              key = kind + "/" + id;
            if (change.type === "removed") remote.delete(key);
            else
              remote.set(key, {
                kind,
                data: decodeDocument(kind, id, uid, change.doc.data()).catch(
                  () => null,
                ),
              });
          }
          ready.add(kind);
          unavailable.delete(kind);
          schedule();
        },
        () => {
          ready.delete(kind);
          unavailable.add(kind);
          schedule();
        },
      ),
    );
  }
  for (const kind of kinds) listen(kind);
  const wake = () => {
    for (const kind of kinds) if (unavailable.has(kind)) listen(kind);
    schedule();
  };
  const recovery = setInterval(() => {
    if (unavailable.size) wake();
  }, 30000);
  window.addEventListener("online", wake);
  window.addEventListener("offline", wake);
  window.addEventListener("chesscue-history", wake);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(recovery);
    for (const unsubscribe of unsubscribes.values()) unsubscribe();
    window.removeEventListener("online", wake);
    window.removeEventListener("offline", wake);
    window.removeEventListener("chesscue-history", wake);
  };
}
