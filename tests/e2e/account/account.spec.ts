import { googleLogin } from "./google-login";
import { generatedTransferRegistry } from "../../../src/domain/transfer";

import { expect, test } from "@playwright/test";

test("opens Account without requiring a guest to leave their game behind", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Your move");
  await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
  await page.getByRole("gridcell", { name: "Empty e4" }).click();
  await expect(
    page.getByRole("list", { name: "Move history" }).getByRole("listitem"),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Account", exact: true })
    .click({ timeout: 2000 });
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Your training profile" }),
  ).toBeVisible({ timeout: 2000 });
  await page
    .getByRole("region", { name: "Your Elo" })
    .getByRole("button", { name: "View rank path" })
    .click();
  await expect(page.getByRole("heading", { name: "The climb" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Account", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Move history" }).getByRole("listitem"),
  ).toHaveCount(2);
});

test("merges guest history by consent, restores it on another device, and isolates sign-out", async ({
  browser,
  page,
  baseURL,
}) => {
  test.skip(
    baseURL !== "http://127.0.0.1:4187",
    "Requires Firebase Auth and Firestore emulators",
  );
  test.setTimeout(90000);
  const email = "player-" + crypto.randomUUID() + "@example.test";
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Your move");
  await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
  await page.getByRole("gridcell", { name: "Empty e4" }).click();
  await expect(
    page.getByRole("list", { name: "Move history" }).getByRole("listitem"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Resign game" }).click();
  await page.getByRole("button", { name: "Review this game" }).click();
  await expect(
    page.getByRole("heading", { name: "Game debrief" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore the turning point" }).click();
  await page.getByRole("gridcell", { name: "White pawn on d2" }).click();
  await page.getByRole("gridcell", { name: /Empty d4/ }).click();
  await page.clock.setFixedTime(new Date(Date.now() - 7 * 86400000));
  await page.getByRole("button", { name: "Finish review" }).click();
  await expect(
    page.getByText("Review complete", { exact: true }),
  ).toBeVisible();
  await page.clock.setFixedTime(new Date());
  await page.getByRole("button", { name: "Back to game result" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Training plan" }).click();
  const practice = page.getByRole("button", { name: /^Practice / });
  await expect(practice).toHaveCount(1);
  const theme = (await practice.innerText())
    .replace(/^Practice /, "")
    .replaceAll(" ", "-");
  const move = generatedTransferRegistry.find(
    (e) => e.theme === theme && e.difficulty === "unlabeled",
  )?.verification.bestMoveUci;
  if (!move) throw new Error("Expected a due exercise with a verified move");
  await practice.click();
  await page
    .getByRole("gridcell", { name: new RegExp(move.slice(0, 2) + "$") })
    .click();
  await page
    .getByRole("gridcell", { name: new RegExp(move.slice(2, 4) + "(,|$)") })
    .click();
  await page.getByRole("button", { name: "Back to training plan" }).click();
  const checked = page.getByText(/1 of 1 completed game analyzed/);
  await expect(checked).toBeVisible();
  const skills = await page
    .getByRole("group", { name: "Chess skills" })
    .getByRole("button")
    .allTextContents();
  const completion = await page.evaluate(() =>
    Object.keys(localStorage).find(
      (k) =>
        k.startsWith("chesscue-due-practice:") &&
        localStorage.getItem(k) === "done",
    ),
  );
  if (!completion) throw new Error("Guest practice completion missing");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const mastery = await page
    .getByRole("region", { name: "Your training profile" })
    .innerText();
  await googleLogin(page, email);
  await page.getByRole("button", { name: "Add guest games" }).click();
  await expect(page.getByText(/^Last game synced/)).toBeVisible({
    timeout: 20000,
  });
  const other = await browser.newContext({
    baseURL: page.url(),
    viewport: { width: 390, height: 844 },
  });
  try {
    const b = await other.newPage();
    await b.goto("/");
    await expect(b.getByRole("status")).toHaveText("Your move");
    await b.getByRole("gridcell", { name: "White pawn on d2" }).click();
    await b.getByRole("gridcell", { name: "Empty d4" }).click();
    await expect(
      b.getByRole("list", { name: "Move history" }).getByRole("listitem"),
    ).toHaveCount(2);
    await googleLogin(b, email);
    await b.getByRole("button", { name: "Keep guest-only" }).click();
    await expect(b.getByText(/^Last game synced/)).toBeVisible({
      timeout: 20000,
    });
    await b.getByRole("button", { name: "Account", exact: true }).click();
    await expect(b.getByRole("region", { name: "Your Elo" })).toContainText(
      "Placement · 1 of 5",
    );
    await expect
      .poll(
        () =>
          b.getByRole("region", { name: "Your training profile" }).innerText(),
        { timeout: 15000 },
      )
      .toBe(mastery);
    await b.getByRole("button", { name: "Training plan" }).click();
    await expect(b.getByText(/1 of 1 completed game analyzed/)).toBeVisible();
    await expect
      .poll(() =>
        b
          .getByRole("group", { name: "Chess skills" })
          .getByRole("button")
          .allTextContents(),
      )
      .toEqual(skills);
    await expect
      .poll(() =>
        b.evaluate(
          (key) =>
            Object.keys(localStorage).some(
              (k) =>
                k.endsWith("/" + key) && localStorage.getItem(k) === "done",
            ),
          completion,
        ),
      )
      .toBe(true);
    await b.reload();
    await b.getByRole("button", { name: "Account", exact: true }).click();
    await expect(b.getByText(email, { exact: true })).toBeVisible();
    await b.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await other.setOffline(true);
    await b.reload();
    await b.getByRole("button", { name: "Account", exact: true }).click();
    await expect(b.getByText(email, { exact: true })).toBeVisible();
    await b.getByRole("button", { name: "Play", exact: true }).click();
    await expect(b.getByRole("status")).toHaveText("Your move");
    await b.getByRole("button", { name: "Resign game" }).click();
    await b.getByRole("button", { name: "Account", exact: true }).click();
    await expect(b.getByRole("status")).toContainText("Offline");
    // A legacy device can hold different immutable content at an existing ID.
    // Preserve that copy while the newly completed offline game uploads.
    await b.evaluate(async () => {
      const name = (await indexedDB.databases()).find((db) =>
        db.name?.startsWith("chesscue-account-"),
      )?.name;
      if (!name) throw new Error("Account cache missing");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => {
          resolve(r.result);
        };
        r.onerror = () => {
          reject(new Error("Cache unavailable"));
        };
      });
      try {
        const tx = db.transaction("games", "readwrite");
        const store = tx.objectStore("games");
        const request = store.getAll();
        request.onsuccess = () => {
          const records: unknown[] = request.result;
          const earlier = records.find(
            (game) =>
              game &&
              typeof game === "object" &&
              "completedAt" in game &&
              game.completedAt &&
              "moves" in game &&
              Array.isArray(game.moves) &&
              game.moves.length > 0,
          );
          if (!earlier || typeof earlier !== "object") {
            tx.abort();
            return;
          }
          store.put({ ...earlier, configurationVersion: "legacy-device" });
        };
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => {
            resolve();
          };
          tx.onabort = () => {
            reject(new Error("Could not seed local conflict"));
          };
        });
      } finally {
        db.close();
      }
    });
    await other.setOffline(false);
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await expect(page.getByRole("region", { name: "Your Elo" })).toContainText(
      "Placement · 2 of 5",
      { timeout: 20000 },
    );
    await expect(b.getByText("Some records need attention")).toBeVisible({
      timeout: 15000,
    });
    await expect(b.getByText(/1 conflicting record/)).toBeVisible();
    await b.getByRole("button", { name: "Sign out" }).click();
    await expect(
      b.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Account", exact: true }).click();
    await expect(b.getByRole("region", { name: "Your Elo" })).toContainText(
      "Placement · 0 of 5",
    );
    await b.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      b.getByRole("list", { name: "Move history" }).getByRole("listitem"),
    ).toHaveCount(2);
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await googleLogin(page, "second-" + email);
    await expect(
      page.getByRole("button", { name: "Add guest games" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await expect(page.getByRole("region", { name: "Your Elo" })).toContainText(
      "Placement · 0 of 5",
    );
  } finally {
    await other.close();
  }
});
