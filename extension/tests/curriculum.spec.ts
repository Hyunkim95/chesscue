import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("opens the full installed curriculum and solves a position offline in the side panel", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    viewport: { width: 320, height: 760 },
    args: ["--enable-unsafe-extension-debugging"],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  try {
    const browser = context.browser();
    if (!browser) throw new Error("No extension-capable Chrome connection.");
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: resolve("extension/dist"),
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await context.setOffline(true);
    await page.goto("chrome-extension://" + id + "/index.html?panel=1");
    await page.getByRole("button", { name: "Practice", exact: true }).click();

    const stages = page.getByRole("group", { name: "Curriculum stages" });
    await expect(
      page.getByRole("heading", { name: "Skill tree", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".practice-tree__evidence")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Choose a skill" }).locator("img"),
    ).toHaveCount(1);
    await expect(
      page.getByRole("group", { name: "Chess skills" }),
    ).toBeHidden();
    for (const [title, count] of [
      ["Play safely", 5],
      ["Create and answer threats", 6],
      ["Calculate and convert", 5],
      ["Make a plan", 5],
    ] as const) {
      const units = page.getByRole("list", { name: title + " units" });
      await stages.getByRole("combobox").selectOption({ label: title });
      await expect(units.getByRole("listitem")).toHaveCount(count);
    }
    await stages
      .getByRole("combobox")
      .selectOption({ label: "Create and answer threats" });
    await page
      .getByRole("button", { name: "Attack two targets", exact: true })
      .click();
    const tactic = page.getByRole("group", {
      name: "Attack two targets exercises",
    });
    await expect(
      page.getByText("Shared puzzle library", { exact: true }),
    ).toHaveCount(0);
    const forkPuzzle = tactic.getByRole("button", {
      name: "Practice puzzle",
      exact: true,
    });
    await expect(forkPuzzle).toHaveCount(1);
    await expect(tactic.getByRole("button", { name: /rating/i })).toHaveCount(
      0,
    );
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await forkPuzzle.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath("skill-puzzles-" + String(width) + ".png"),
      });
    }
    await forkPuzzle.click();
    await expect(
      page.getByRole("heading", { name: "Find the first move" }),
    ).toBeVisible();
    const rook = page.getByRole("region", { name: "Explore with Rook" });
    await expect(rook.getByLabel("Ask Rook")).toBeVisible();
    await rook.getByLabel("Ask Rook").fill("What is the material balance?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(rook.getByRole("log")).toContainText(
      /material is level|ahead by/i,
    );
    await expect(
      rook.getByRole("gridcell", { name: /White knight on g4/ }),
    ).toBeVisible();
    const first = page.url();
    await page.getByRole("button", { name: "Back to Practice" }).click();
    await forkPuzzle.click();
    await expect(page).toHaveURL(first);
    await page.getByRole("gridcell", { name: /White knight on g4/ }).click();
    await page.getByRole("gridcell", { name: /Black knight on f6/ }).click();
    await expect(page.getByText("Good move", { exact: true })).toBeVisible();
    await expect(
      rook.getByRole("gridcell", { name: /Empty g4/ }),
    ).toBeVisible();
    await expect(
      rook.getByRole("group", { name: "Rook’s move explanation" }).first(),
    ).toBeVisible();
    await rook.getByRole("button", { name: "Rewind", exact: true }).click();
    await expect(
      rook.getByRole("gridcell", { name: /White knight on g4/ }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Back to Practice" }).click();
    await page.reload();
    await forkPuzzle.click();
    await expect(
      page.getByRole("gridcell", { name: /White rook on c5/ }),
    ).toBeVisible();
    expect(page.url()).not.toBe(first);
    await page.getByRole("button", { name: "Back to Practice" }).click();
    await page
      .getByRole("button", {
        name: "Exploit or escape a line tactic",
        exact: true,
      })
      .click();
    const linePuzzle = page
      .getByRole("group", { name: "Exploit or escape a line tactic exercises" })
      .getByRole("button", { name: "Practice puzzle", exact: true });
    await expect(linePuzzle).toHaveCount(1);

    await page.setViewportSize({ width: 320, height: 760 });
    await stages.getByRole("combobox").selectOption({ label: "Play safely" });
    await page.getByText("Read the board", { exact: true }).click();
    const selectedSkill = page.getByRole("button", {
      name: "Read the board",
      exact: true,
    });
    const exercisePanel = page.getByRole("group", {
      name: "Read the board exercises",
    });
    const nextBranch = page.getByRole("button", {
      name: /Count the cost of a capture/,
    });
    const selectedBox = await selectedSkill.boundingBox();
    const panelBox = await exercisePanel.boundingBox();
    const branchBox = await nextBranch.boundingBox();
    expect(
      selectedBox &&
        panelBox &&
        branchBox &&
        selectedBox.y + selectedBox.height <= panelBox.y &&
        panelBox.y + panelBox.height <= branchBox.y,
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: test.info().outputPath("curriculum-320.png"),
    });
    await page
      .getByRole("button", { name: "Practice puzzle", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Find the first move" }),
    ).toBeVisible();

    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(
        page.getByRole("grid", { name: "Training board, White side" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath("exercise-" + String(width) + ".png"),
      });
    }
    await page.reload();
    await page.getByRole("gridcell", { name: /White king on e1/ }).click();
    await page
      .getByRole("gridcell", { name: /Empty g1, legal destination/ })
      .click();
    await expect(page.getByText("Good move", { exact: true })).toBeVisible();
    await page.getByText("Sources", { exact: true }).click();
    await expect(page.getByText(/OpenAI GPT-6.2 Sol/)).toBeVisible();
  } finally {
    await context.close();
  }
});

test("highlights a curriculum unit from a verified miss in an imported game", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    viewport: { width: 320, height: 760 },
    args: ["--enable-unsafe-extension-debugging"],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  try {
    const browser = context.browser();
    if (!browser) throw new Error("No extension-capable Chrome connection.");
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: resolve("extension/dist"),
    });
    const page = context.pages()[0] ?? (await context.newPage());
    await context.setOffline(true);
    await page.goto("chrome-extension://" + id + "/index.html?panel=1#import");
    await page
      .getByLabel("Paste completed PGN games")
      .fill(
        '[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2"]\n[Result "0-1"]\n\n2. g4 Qh4# 0-1',
      );
    await page.getByRole("radio", { name: "I played White" }).check();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    await expect(page).toHaveURL(/#review\//);
    await expect(page.getByLabel("Ask Rook")).toBeVisible({ timeout: 20000 });
    // Exercise the recommendation UI with a fixed, legal analysis. The short
    // Stockfish search above can select different lines across machines.
    const gameId = decodeURIComponent(
      new URL(page.url()).hash.split("/")[1] ?? "",
    );
    await page.evaluate(async (gameId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("adaptive-chess-tutor");
        open.onsuccess = () => {
          resolve(open.result);
        };
        open.onerror = () => {
          reject(open.error);
        };
      });
      try {
        const transaction = db.transaction("analyses", "readwrite");
        const analysisVersion = "stockfish-19-lite@2";
        transaction.objectStore("analyses").put(
          {
            schemaVersion: 1,
            gameId,
            analysisVersion,
            engineBuild: "Stockfish 19 Lite",
            searchSettings: { timeBudgetPerPositionMs: 1000, multiPv: 1 },
            facts: [
              {
                schemaVersion: 1,
                gameId,
                analysisVersion,
                ply: 1,
                fenBefore:
                  "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
                playedMoveUci: "g2g4",
                playedMoveSan: "g4",
                evaluationBeforeCp: 0,
                evaluationAfterCp: -99999,
                impactCp: 99999,
                phase: "opening",
                theme: "one-move-threat",
                recurrence: 0,
                curricularRelevance: 100,
                candidates: [
                  {
                    uci: "e2e3",
                    san: "e3",
                    evaluationCp: 0,
                    principalVariation: ["e2e3"],
                  },
                ],
              },
            ],
            moments: [],
            analyzedPlayerMoves: 1,
            validationStatus: "validated",
            analyzedAt: "2026-01-01T00:00:00Z",
          },
          JSON.stringify([gameId, analysisVersion]),
        );
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => {
            resolve();
          };
          transaction.onabort = () => {
            reject(transaction.error);
          };
        });
      } finally {
        db.close();
      }
    }, gameId);

    await page.getByRole("button", { name: "Practice", exact: true }).click();
    const next = page.getByRole("button", {
      name: "See the opponent’s next threat, recommended from your games",
    });
    await expect(next).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".practice-tree__evidence")).toBeVisible();
    await expect(page.locator(".practice-tree__evidence")).not.toContainText(
      "g4",
    );
    const card = page.getByRole("group", {
      name: "See the opponent’s next threat exercises",
    });
    await expect(
      page.getByText("Game analysis by skill", { exact: true }),
    ).toHaveCount(0);
    await expect(
      card.getByRole("button", { name: "Practice puzzle", exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Practice puzzle", exact: true }),
    ).toHaveCount(1);
    await expect(card.getByText(/g4/)).toHaveCount(0);
    await card
      .getByRole("button", { name: "Practice puzzle", exact: true })
      .click();
    await expect(
      page.getByRole("gridcell", { name: "White pawn on g2" }),
    ).toBeVisible();
    const gamePuzzle = page.url();
    await page.getByRole("button", { name: "Back to Practice" }).click();
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("adaptive-chess-tutor");
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error("Open failed"));
        };
      });
      try {
        const tx = db.transaction(["games", "reviewEvidence"], "readwrite");
        const game = tx.objectStore("games").getAllKeys();
        game.onsuccess = () =>
          tx.objectStore("reviewEvidence").add({
            schemaVersion: 1,
            id: "curriculum-due-fixture",
            gameId: game.result[0],
            analysisVersion: "stockfish-19-lite@1",
            theme: "one-move-threat",
            firstAttemptScore: 50,
            hardSpot: "Check their reply.",
            dueReview: "2026-01-02",
            reinforcement: "Find the stronger move.",
            transfer: "scheduled-next-game",
            completedAt: "2026-01-01T00:00:00Z",
          });
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => {
            resolve();
          };
          tx.onabort = () => {
            reject(tx.error ?? new Error("Write failed"));
          };
        });
      } finally {
        db.close();
      }
    });
    await page.reload();
    await expect(
      card.getByRole("button", { name: "Practice puzzle", exact: true }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Practice puzzle", exact: true })
      .click();
    await expect(page).not.toHaveURL(gamePuzzle);
    await expect(
      page.getByRole("grid", { name: /Training board/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to Practice" }).click();
    await expect(
      card.getByRole("button", { name: "Practice puzzle", exact: true }),
    ).toBeVisible();
    await card.getByRole("button", { name: "Attacking lessons" }).click();
    const lessons = page.getByRole("region", {
      name: "Lessons and position practice",
    });
    await lessons
      .getByRole("button", { name: /^Play Move/ })
      .first()
      .click();
    await expect(
      page.getByRole("region", { name: "Lesson challenge" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to challenges" }).click();
    await expect(lessons).toBeVisible();
    await page
      .getByRole("button", { name: "Back to Skill tree", exact: true })
      .click();
    await expect(
      card.getByRole("button", { name: "Attacking lessons" }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Practice puzzle", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: test.info().outputPath("recommended-320.png"),
    });
    await page.setViewportSize({ width: 420, height: 760 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(420);
    await expect(next).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("recommended-420.png"),
    });
  } finally {
    await context.close();
  }
});
