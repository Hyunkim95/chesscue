import { Chess } from "chess.js";
import { expect, test, type Page } from "@playwright/test";
import { googleLogin } from "./google-login";

async function seedGame(page: Page, complete: boolean) {
  const chess = complete
    ? new Chess()
    : new Chess("7k/5K2/8/8/8/8/8/R7 w - - 0 1");
  const initialFen = chess.fen(),
    at = new Date().toISOString(),
    id = crypto.randomUUID();
  const line = complete
    ? ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]
    : [];
  const moves = line.map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      uci: move.lan,
      san: move.san,
      fenAfter: move.after,
      playedAt: at,
    };
  });
  const game = {
    schemaVersion: 1,
    id,
    createdAt: at,
    completedAt: complete ? at : null,
    origin: { type: "tutor", mode: "rated", opponentElo: 1450 },
    initialFen,
    moves,
    pgn: chess.pgn(),
    result: complete ? "white-win" : null,
    playerColor: "white",
    curriculumVersion: "1",
    configurationVersion: "1",
    fingerprint: null,
  };
  const uid = await page.evaluate(async (game) => {
    const name = (await indexedDB.databases()).find((d) =>
      d.name?.startsWith("chesscue-account-"),
    )?.name;
    if (!name) throw new Error("Signed-in database missing");
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(["games", "syncReceipts"], "readwrite");
        tx.objectStore("games").add(game);
        if (game.completedAt)
          tx.objectStore("syncReceipts").add(
            { queuedAt: Date.now(), acknowledgedAt: null },
            game.id,
          );
        else
          localStorage.setItem(
            name + "/chesscue-active-play-mode",
            JSON.stringify({ mode: "rated", gameId: game.id }),
          );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          reject(new Error("Fixture write failed"));
        };
      };
      open.onerror = () => {
        reject(new Error("Database unavailable"));
      };
    });
    window.dispatchEvent(new Event("chesscue-history"));
    return decodeURIComponent(name.slice("chesscue-account-".length));
  }, game);
  return { uid, id };
}
async function finish(page: Page) {
  await page.goto("/");
  // Wait for the signed-in account's saved position before selecting its rook.
  await expect(
    page.getByRole("gridcell", { name: "White king on f7" }),
  ).toBeVisible();
  await page.getByRole("gridcell", { name: "White rook on a1" }).click();
  await page.getByRole("gridcell", { name: /Empty h1/ }).click();
  await expect(page.getByText("Share this win", { exact: true })).toBeVisible();
}
test("offline win overtakes a later finisher within five seconds of sync and shares a playable position", async ({
  page,
  browser,
  context,
  baseURL,
  request,
}, testInfo) => {
  test.skip(
    baseURL !== "http://127.0.0.1:4187",
    "Uses the local social pilot emulators",
  );
  test.setTimeout(100000);
  const other = await browser.newContext({
    baseURL: "http://127.0.0.1:4187",
    viewport: { width: 390, height: 844 },
  });
  try {
    const friend = await other.newPage();
    for (const p of [page, friend]) {
      await p.goto("/");
      await googleLogin(p, crypto.randomUUID() + "@example.test");
      await expect(p.getByText("Up to date", { exact: true })).toBeVisible();
      await seedGame(p, true);
      await expect(p.getByText(/^Last game synced/)).toBeVisible();
    }
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Change game mode" }).click();
    await page.getByRole("link", { name: "Elo races" }).click();
    await page.getByLabel("Elo to gain").fill("10");
    await page.getByRole("button", { name: "Create race" }).click();
    const invite = page.getByLabel("Invite friends");
    await expect(invite).toBeVisible();
    const url = await invite.inputValue();
    await friend.goto(url);
    await friend.getByRole("button", { name: "Join race" }).click();
    const standings = friend.getByRole("list", { name: "Race standings" });
    await expect(standings.getByRole("listitem")).toHaveCount(2);
    const a = await seedGame(page, false);
    await seedGame(friend, false);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByLabel("Invite friends")).toBeVisible();
    await context.setOffline(true);
    await finish(page);
    await page.goto(url);
    await expect(page.getByText("Pending sync")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Pending sync")).toBeVisible();
    await finish(friend);
    await friend.goto(url);
    const mine = standings.getByRole("listitem").filter({ hasText: "(you)" });
    const theirs = standings
      .getByRole("listitem")
      .filter({ hasNotText: "(you)" });
    await expect(mine.getByText("Provisional winner")).toBeVisible();
    const visible = theirs
      .getByText("Provisional winner")
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => Date.now());
    await context.setOffline(false);
    const displayedAt = await visible;
    const record = await request.get(
      "http://127.0.0.1:8080/v1/projects/demo-chesscue-account/databases/(default)/documents/users/" +
        a.uid +
        "/games/" +
        a.id,
      { headers: { Authorization: "Bearer owner" } },
    );
    expect(record.ok()).toBe(true);
    const payload: unknown = await record.json();
    if (
      !payload ||
      typeof payload !== "object" ||
      !("createTime" in payload) ||
      typeof payload.createTime !== "string"
    )
      throw new Error("Server commit timestamp missing");
    const latency = displayedAt - Date.parse(payload.createTime);
    expect(latency).toBeGreaterThanOrEqual(0);
    expect(latency).toBeLessThanOrEqual(5000);
    await testInfo.attach("ack-to-visible.json", {
      body: JSON.stringify({ milliseconds: latency }),
      contentType: "application/json",
    });
    await expect(mine.getByText("Provisional winner")).toBeHidden();
    await expect(page.getByText("Pending sync")).toBeHidden();
    for (const [label, p] of [
      ["desktop", page],
      ["mobile", friend],
    ] as const) {
      expect(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const path = testInfo.outputPath(label + ".png");
      await p.screenshot({ path });
      await testInfo.attach(label + " standings", {
        path,
        contentType: "image/png",
      });
    }
    await page.getByRole("link", { name: "Back to Play", exact: true }).click();
    await page.getByText("Share this win", { exact: true }).click();
    await page
      .getByLabel("Include race")
      .selectOption({ label: "Gain 10 Elo" });
    await page.getByRole("button", { name: "Create win link" }).click();
    const winUrl = await page.getByLabel("Shared win link").inputValue();
    const guest = await browser.newPage();
    try {
      await guest.goto(winUrl);
      await expect(guest.getByText(/Race goal/)).toBeVisible();
      await guest.getByRole("gridcell", { name: "White rook on a1" }).click();
      await guest.getByRole("gridcell", { name: /Empty h1/ }).click();
      await expect(guest.getByText("Your move: Rh1#")).toBeVisible();
      await guest.getByRole("button", { name: "Reveal played move" }).click();
      await expect(guest.getByText("Played: Rh1#")).toBeVisible();
      await expect(
        guest.getByRole("link", { name: "View race invitation" }),
      ).toHaveAttribute("href", new URL(url).hash);
      await guest.getByRole("button", { name: "Play your own game" }).click();
      await expect(guest.getByRole("status")).toHaveText("Your move");
    } finally {
      await guest.close();
    }
  } finally {
    await other.close();
  }
});

test("SLO-011 renders 99 of 100 acknowledged race updates within five seconds", async ({
  browser,
  page,
  baseURL,
  request,
}, testInfo) => {
  test.skip(baseURL !== "http://127.0.0.1:4187", "Requires the race emulators");
  test.setTimeout(300000);
  const friend = await browser.newPage({ baseURL: "http://127.0.0.1:4187" });
  try {
    for (const p of [page, friend]) {
      await p.goto("/");
      await googleLogin(p, crypto.randomUUID() + "@example.test");
      await expect(p.getByText("Up to date", { exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.getByRole("button", { name: "Change game mode" }).click();
    await page.getByRole("link", { name: "Elo races" }).click();
    await page.getByRole("button", { name: "Create race" }).click();
    const url = await page.getByLabel("Invite friends").inputValue();
    await friend.goto(url);
    await friend.getByRole("button", { name: "Join race" }).click();
    const racer = friend
      .getByRole("list", { name: "Race standings" })
      .getByRole("listitem")
      .filter({ hasNotText: "(you)" });
    await expect(racer).toContainText("In placement");
    const times: number[] = [];
    let rating = 1450;
    const watchChannel = /google\.firestore\.v1\.Firestore\/Listen\/channel/;
    let repairedReads = 0;
    friend.on("response", (response) => {
      if (response.ok() && response.url().includes(":runQuery"))
        repairedReads++;
    });
    for (let i = 0; i < 100; i++) {
      if (i === 10) {
        await friend.context().setOffline(true);
        await friend.route(watchChannel, (route) =>
          route.abort("connectionreset"),
        );
        await friend.context().setOffline(false);
        await friend.reload();
        await expect(racer).toBeVisible();
        repairedReads = 0;
      }
      if (i === 13) {
        expect(
          repairedReads,
          "foreground standings fetched while the live stream was interrupted",
        ).toBeGreaterThan(0);
        await friend.unroute(watchChannel);
      }
      const game = await seedGame(page, true);
      rating = Math.round(
        rating + 32 * (1 - 1 / (1 + 10 ** ((1450 - rating) / 400))),
      );
      const visible = racer
        .getByText(rating.toString() + " Elo", { exact: true })
        .waitFor({ state: "visible", timeout: 15000 })
        .then(
          () => Date.now(),
          () => null,
        );
      const ref =
        "http://127.0.0.1:8080/v1/projects/demo-chesscue-account/databases/(default)/documents/users/" +
        game.uid +
        "/games/" +
        game.id;
      const rendered = await visible;
      const response = await request.get(ref, {
        headers: { Authorization: "Bearer owner" },
      });
      expect(response.ok(), "game acknowledged by Firestore").toBe(true);
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !("createTime" in data) ||
        typeof data.createTime !== "string"
      )
        throw new Error("Missing commit time");
      times.push(
        rendered === null ? Infinity : rendered - Date.parse(data.createTime),
      );
    }
    times.sort((a, b) => a - b);
    const metrics = {
      samples: times.length,
      within5s: times.filter((ms) => ms >= 0 && ms <= 5000).length,
      p50Ms: times[49],
      p99Ms: times[98],
      maxMs: times[99],
    };
    await testInfo.attach("visibility.json", {
      body: JSON.stringify(metrics),
      contentType: "application/json",
    });
    console.log("SLO-011", metrics);
    expect(metrics.within5s).toBeGreaterThanOrEqual(99);
  } finally {
    await friend.close();
  }
});
