import { Chess } from "chess.js";

import { expect, test } from "@playwright/test";

test("recommends and solves a verified puzzle from an imported game offline", async ({
  page,
  context,
}) => {
  await page.route("https://**/*", (route) => route.abort());
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Review", exact: true })
    .click();
  await page.getByRole("button", { name: "Import PGN", exact: true }).click();
  await page
    .getByLabel("Paste completed PGN games")
    .fill(
      '[Event "Verified training fixture"]\n[SetUp "1"]\n[FEN "6k1/p4ppp/8/8/8/8/5PPP/3R2K1 w - - 0 28"]\n[Result "1-0"]\n\n28. Rd2 a6 29. Rd8# 1-0',
    );
  await page.getByRole("radio", { name: "I played White" }).check();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Import games", exact: true })
    .click();
  await expect(page).toHaveURL(/#review\//);
  await expect(
    page.getByRole("region", { name: "Explore with Rook" }),
  ).toBeVisible();
  await page.goto("/#skill-tree");
  const recommended = page.locator(
    ".practice-tree__node[data-recommended=true]",
  );
  await expect(recommended).toBeVisible({ timeout: 15000 });
  await context.setOffline(true);
  await recommended.click();
  await expect(
    page.getByRole("gridcell", { name: "White rook on d1" }),
  ).toBeVisible();
  await page.getByRole("gridcell", { name: "White rook on d1" }).click();
  await page.getByRole("gridcell", { name: /Empty d8/ }).click();
  await expect(page.getByText("Good move", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Back to Practice", exact: true })
    .click();
  await expect(recommended).toBeFocused();
});

test("opens the rank path and trains the threats branch from the skill tree", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Rank path" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Skill tree", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Curriculum skill tree" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skill tree", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Curriculum skill tree" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Your training profile" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page
    .getByRole("region", { name: "Your Elo" })
    .getByRole("button", { name: "View rank path" })
    .click();
  await expect(page.getByRole("heading", { name: "The climb" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Rank tiers" }).getByRole("button"),
  ).toHaveCount(5);
  await page.getByRole("button", { name: /Crown.*1,750/ }).click();
  await expect(
    page.getByRole("heading", { name: "Crown", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await page
    .getByRole("button", {
      name: "See the opponent’s next threat",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Explore with Rook" }),
  ).toBeVisible();
});

test("replays a real rated miss without changing rank or mastery on retry", async ({
  page,
}) => {
  const fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
  const chess = new Chess(fen),
    move = chess.move("Re2"),
    now = "2026-11-24T12:00:00Z";
  const record = {
    schemaVersion: 1,
    id: "rated-back-rank-miss",
    origin: { type: "tutor", mode: "rated", opponentElo: 1450 },
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    createdAt: now,
    completedAt: now,
    initialFen: fen,
    playerColor: "white",
    result: "black-win",
    pgn: chess.pgn(),
    fingerprint: null,
    moves: [
      {
        ply: 1,
        san: move.san,
        uci: move.lan,
        fenAfter: chess.fen(),
        playedAt: now,
      },
    ],
  };
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Your move");
  await page.evaluate(
    (game) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("adaptive-chess-tutor");
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("games", "readwrite");
          tx.objectStore("games").put(game);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(new Error("Could not seed rated game"));
          };
        };
      }),
    record,
  );
  await page.evaluate((fen) => {
    localStorage.setItem(
      JSON.stringify(["gemini-nano-mate-motif-v1", fen, "e1e8"]),
      "back-rank",
    );
  }, fen);
  await page.reload();
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  const recommended = page.locator(
    ".practice-tree__node[data-recommended=true]",
  );
  await expect(recommended).toBeVisible();
  await recommended.click();
  await page.getByRole("gridcell", { name: "White rook on e1" }).click();
  await page.getByRole("gridcell", { name: /Empty e8/ }).click();
  await expect(page.getByText("Good move", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  const rank = page.getByRole("region", { name: "Your Elo" });
  await expect(
    rank.getByRole("heading", { name: "Sapphire" }),
  ).toBeInViewport();
  await expect(rank.getByText("1,434 ChessCue Elo")).toBeInViewport();
  await page.getByRole("button", { name: "View rank path" }).click();
  await expect(page.getByText("1,434 ChessCue Elo")).toBeVisible();
});
