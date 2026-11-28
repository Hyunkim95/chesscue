import { expect, test, type Page } from "@playwright/test";
import { Chess } from "chess.js";

// The board-first result after a game (design §3): the final position, the
// result with the Elo change or the unrated label, and Rook's moments.

test.use({ viewport: { width: 360, height: 800 } });

// Rook's moments wait for Stockfish to analyse the whole game, which can take
// most of a minute while other workers run. The test limit covers the waits
// these tests declare (20 s, 60 s and 30 s), so a slow analysis is not cut off
// by the default 30 s test timeout first.
const ANALYSIS_TEST_TIMEOUT = 120_000;

const friedLiver = [
  "e4",
  "e5",
  "Nf3",
  "Nc6",
  "Bc4",
  "Nf6",
  "Ng5",
  "d5",
  "exd5",
  "Nxd5",
  "Nxf7",
  "Kxf7",
  "Qf3+",
  "Ke6",
  "Nc3",
  "Nb4",
  "a3",
  "Nxc2+",
  "Kd1",
  "Nxa1",
  "Nxd5",
  "Qh4",
  "Nxc7+",
  "Kd7",
  "Qf7+",
  "Be7",
  "Qxe7#",
];

function finishedGame(
  id: string,
  mode: "rated" | "coached",
  playerColor: "white" | "black",
) {
  const chess = new Chess();
  const moves = friedLiver.map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      san: move.san,
      uci: move.lan,
      fenAfter: move.after,
      playedAt: new Date(Date.UTC(2026, 10, 27, 10, index)).toISOString(),
    };
  });
  return {
    schemaVersion: 1,
    id,
    origin:
      mode === "rated"
        ? { type: "tutor", mode, opponentElo: 1450 }
        : { type: "tutor", mode },
    initialFen: new Chess().fen(),
    moves,
    pgn: chess.pgn(),
    playerColor,
    result: "white-win",
    createdAt: moves[0]?.playedAt,
    completedAt: moves.at(-1)?.playedAt,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    fingerprint: null,
  };
}

async function injectGame(page: Page, game: ReturnType<typeof finishedGame>) {
  await page.goto("/?ui=board-first");
  await expect(page.locator(".today")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(async (record) => {
    const request = indexedDB.open("adaptive-chess-tutor");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(new Error("IndexedDB did not open"));
      };
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("games", "readwrite");
      tx.objectStore("games").put(record);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(new Error("The game was not stored"));
      };
    });
    db.close();
  }, game);
  await page.goto(`/?ui=board-first#result/${game.id}`);
  await page.reload();
}

test("a coached win shows the final board and is unrated, never calculating Elo", async ({
  page,
}) => {
  await injectGame(
    page,
    finishedGame("11111111-2222-4333-8444-0000000000c1", "coached", "white"),
  );

  await expect(page.getByRole("grid", { name: "Final position" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You won · Coached game, unrated",
  );
  await expect(
    page.locator("[role=gridcell][aria-label$='last move ended here']"),
  ).toHaveAccessibleName(/queen on e7/);
  await expect(page.getByText("Calculating your Elo")).toHaveCount(0);
  await expect(page.getByText(/Elo/)).toHaveCount(0);
  await expect(page.getByText("Race friends")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
});

test("a rated loss shows the Elo change and opens Rook's first moment", async ({
  page,
}) => {
  test.setTimeout(ANALYSIS_TEST_TIMEOUT);
  await injectGame(
    page,
    finishedGame("11111111-2222-4333-8444-0000000000a1", "rated", "black"),
  );

  // Seen from Black's side: a8 is in the bottom-right corner.
  await expect(page.getByRole("grid", { name: "Final position" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("gridcell").first()).toHaveAccessibleName(/h1/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^You lost( · -\d+ Elo)?$/,
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    /^You lost · -\d+ Elo$/,
    { timeout: 20_000 },
  );
  await expect(page.getByText(/ to go$/)).toBeVisible();
  await expect(page.getByText("Calculating your Elo")).toHaveCount(0);

  await expect(
    page.getByRole("heading", {
      name: /^Rook found \d+ moments? in this game$/,
    }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Look at (them|it)$/ }).click();
  await expect(page).toHaveURL(
    /#moment\/11111111-2222-4333-8444-0000000000a1%3A/,
  );
  await expect(
    page.getByRole("heading", { name: /Black to move/ }),
  ).toBeVisible({ timeout: 30_000 });
});

test("the opening row plays where the game left the book, then the opening's ideas", async ({
  page,
}) => {
  await injectGame(
    page,
    finishedGame("11111111-2222-4333-8444-0000000000b1", "coached", "white"),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  const row = page.getByRole("button", {
    name: /^Opening\s*Italian Game: Two Knights Defense, Fried Liver Attack\s*You left the book on move 9/,
  });
  await expect(row).toBeVisible({ timeout: 20_000 });

  for (const width of [320, 420]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`opening-row-${String(width)}.png`),
      fullPage: true,
    });
  }

  await row.click();
  await expect(
    page.getByRole("grid", { name: "Opening, step 1 of 4" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "You left the book with a3. The usual move is Qe4, which controls d4 and e5.",
    ),
  ).toBeVisible();
  // The move that left the book is the dashed try; the book move is drawn.
  await expect(page.locator(".chess-board__cue-arrow--tried")).toHaveCount(1);
  await expect(
    page.getByRole("gridcell", { name: /^Empty a3/ }),
  ).toHaveAccessibleDescription("Where the move that left the book landed.");
  await expect(
    page.getByRole("gridcell", { name: /^Empty e4/ }),
  ).toHaveAccessibleDescription("Where the book move lands.");
  for (const width of [320, 420]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`opening-step-${String(width)}.png`),
      fullPage: true,
    });
  }

  await page.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByText(
      "White prepares a centre with c3 and d4 while the bishop on c4 aims at f7.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "↺ Reset" }).click();
  await expect(
    page.getByRole("grid", { name: "Final position" }),
  ).toBeVisible();
  await expect(row).toBeVisible();
});

test("a moment from the opening offers the game's opening once shown, never before", async ({
  page,
}) => {
  test.setTimeout(ANALYSIS_TEST_TIMEOUT);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await injectGame(
    page,
    finishedGame("11111111-2222-4333-8444-0000000000a2", "rated", "black"),
  );
  await page
    .getByRole("button", { name: /^Look at (them|it)$/ })
    .click({ timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: /Black to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "About this opening" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Show me" }).click();
  await page.getByRole("button", { name: "About this opening" }).click();
  await expect(
    page.getByText(
      "Your opponent left the book with a3. The usual move is Qe4, which controls d4 and e5.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("gridcell", { name: /^Empty a3/ }),
  ).toHaveAccessibleDescription("Where the move that left the book landed.");
  for (const width of [320, 420]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`moment-opening-${String(width)}.png`),
      fullPage: true,
    });
  }
});

test("trying the game's move, Why not names and draws the fork it allowed", async ({
  page,
}) => {
  test.setTimeout(ANALYSIS_TEST_TIMEOUT);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const game = finishedGame(
    "11111111-2222-4333-8444-0000000000a3",
    "rated",
    "black",
  );
  await injectGame(page, game);
  await expect(
    page.getByRole("button", { name: /^Look at (them|it)$/ }),
  ).toBeVisible({ timeout: 60_000 });
  // The moment before the game's 5...Nxd5; the order of moments can vary
  // with the analysis, so it is opened directly.
  await page.goto(`/?ui=board-first#moment/${game.id}%3A10`);
  await expect(
    page.getByRole("heading", { name: /Black to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  // The game's 5...Nxd5, played again on the board.
  await page.getByRole("gridcell", { name: /^Black knight on f6/ }).click();
  await page.getByRole("gridcell", { name: /^White pawn on d5/ }).click();
  // Before the try is checked, "Why not Nxd5?" is the game move's preview.
  await expect(page.getByRole("button", { name: "↺ Try again" })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Why not Nxd5?" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.locator(".rook-bubble__text")).toHaveText(
    "I take your pawn with Nxf7 and attack your queen on d8 and your rook on h8 at once.",
  );
  await expect(page.locator(".chess-board__cue-arrow--attack")).toHaveCount(2);
  for (const width of [320, 420]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: test.info().outputPath(`allowed-fork-${String(width)}.png`),
      fullPage: true,
    });
  }
});

// Each fresh browser analyses the game again. The search is to a fixed depth,
// so every analysis opens the same first moment with the same goal.
test("analysing the same game again gives the same moments and goals", async ({
  browser,
}) => {
  test.setTimeout(3 * ANALYSIS_TEST_TIMEOUT);
  const seen: string[] = [];
  for (let run = 0; run < 3; run += 1) {
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
    });
    const page = await context.newPage();
    await injectGame(
      page,
      finishedGame("11111111-2222-4333-8444-0000000000a4", "rated", "black"),
    );
    const found = page.getByRole("heading", {
      name: /^Rook found \d+ moments? in this game$/,
    });
    await expect(found).toBeVisible({ timeout: 60_000 });
    const count = await found.textContent();
    await page.getByRole("button", { name: /^Look at (them|it)$/ }).click();
    await expect(
      page.getByRole("heading", { name: /Black to move/ }),
    ).toBeVisible({ timeout: 30_000 });
    const goal = await page.locator(".moment__goal").textContent();
    seen.push([count, page.url().split("#")[1], goal].join(" | "));
    await context.close();
  }
  expect(new Set(seen).size, seen.join("\n")).toBe(1);
});
