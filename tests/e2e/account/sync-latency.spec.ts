import { Chess } from "chess.js";
import { expect, test } from "@playwright/test";
import { googleLogin } from "./google-login";

test("acknowledges 300 queued completed games across reconnects", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(baseURL !== "http://127.0.0.1:4187", "Requires Firebase emulators");
  test.setTimeout(300000);
  await page.goto("/");
  await googleLogin(page, "latency-" + crypto.randomUUID() + "@example.test");
  await expect(page.getByRole("status")).toHaveText("Up to date", {
    timeout: 20000,
  });
  const databaseName = await page.evaluate(async () => {
    const database = (await indexedDB.databases()).find((d) =>
      d.name?.startsWith("chesscue-account-"),
    );
    if (!database?.name) throw new Error("Account cache missing");
    return database.name;
  });
  const chess = new Chess();
  const now = new Date().toISOString();
  const initialFen = chess.fen();
  const moves = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6"].map(
    (san, i) => {
      const move = chess.move(san);
      return {
        ply: i + 1,
        uci: move.from + move.to,
        san: move.san,
        fenAfter: chess.fen(),
        playedAt: now,
      };
    },
  );
  const game = {
    schemaVersion: 1,
    origin: { type: "tutor", mode: "rated", opponentElo: 1450 },
    initialFen,
    moves,
    pgn: chess.pgn(),
    result: "black-win",
    playerColor: "white",
    createdAt: now,
    completedAt: now,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    fingerprint: null,
  };
  const durations: number[] = [];
  for (let i = 0; i < 300; i++) {
    const id = "latency-" + String(i);
    const disconnect = i % 50 === 0;
    if (disconnect) await context.setOffline(true);
    const queuedAt = await page.evaluate(
      async ({ databaseName, game, id }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const r = indexedDB.open(databaseName);
          r.onsuccess = () => {
            resolve(r.result);
          };
          r.onerror = () => {
            reject(new Error("Could not open cache"));
          };
        });
        const queuedAt = Date.now();
        try {
          const tx = db.transaction(["games", "syncReceipts"], "readwrite");
          tx.objectStore("games").add({ ...game, id });
          tx.objectStore("syncReceipts").add(
            { queuedAt, acknowledgedAt: null },
            id,
          );
          await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => {
              resolve();
            };
            tx.onerror = () => {
              reject(new Error("Queue write failed"));
            };
          });
        } finally {
          db.close();
        }
        window.dispatchEvent(new Event("chesscue-history"));
        return queuedAt;
      },
      { databaseName, game, id },
    );
    const eligibleAt = disconnect
      ? await page.evaluate(() => Date.now())
      : queuedAt;
    if (disconnect) await context.setOffline(false);
    let time = 0;
    await expect
      .poll(
        async () => {
          time = await page.evaluate(
            ({ databaseName, id }) =>
              new Promise<number>((resolve, reject) => {
                const request = indexedDB.open(databaseName);
                request.onsuccess = () => {
                  const db = request.result;
                  const read = db
                    .transaction("syncReceipts")
                    .objectStore("syncReceipts")
                    .get(id);
                  read.onsuccess = () => {
                    const value: unknown = read.result;
                    db.close();
                    resolve(
                      value &&
                        typeof value === "object" &&
                        "acknowledgedAt" in value &&
                        typeof value.acknowledgedAt === "number"
                        ? value.acknowledgedAt
                        : 0,
                    );
                  };
                  read.onerror = () => {
                    db.close();
                    reject(new Error("Receipt read failed"));
                  };
                };
                request.onerror = () => {
                  reject(new Error("Cache unavailable"));
                };
              }),
            { databaseName, id },
          );
          return time;
        },
        { intervals: [100], timeout: 65000 },
      )
      .toBeGreaterThan(0);
    durations.push(time - eligibleAt);
  }
  durations.sort((a, b) => a - b);
  const result = {
    eligible: 300,
    acknowledged: durations.length,
    within60s: durations.filter((n) => n <= 60000).length,
    disconnects: 6,
    p50Ms: durations[149],
    p95Ms: durations[284],
    p99Ms: durations[296],
  };
  await testInfo.attach("sync-latency.json", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  console.log(JSON.stringify(result));
  expect(result.within60s).toBeGreaterThanOrEqual(297);
});
