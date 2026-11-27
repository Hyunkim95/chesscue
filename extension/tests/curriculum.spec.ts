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
    const network = await context.newCDPSession(page);
    const treeLoad = Promise.withResolvers<undefined>();
    const puzzleLoad = Promise.withResolvers<undefined>();
    await network.send("Fetch.enable", {
      patterns: [
        { urlPattern: "*/assets/PracticeCurriculum-*.js" },
        { urlPattern: "*/assets/puzzle-catalog-*.js" },
      ],
    });
    network.on("Fetch.requestPaused", ({ request, requestId }) => {
      const load = request.url.includes("/PracticeCurriculum-")
        ? treeLoad
        : puzzleLoad;
      void load.promise
        .then(() => network.send("Fetch.continueRequest", { requestId }))
        .catch(() => undefined);
    });
    await context.setOffline(true);
    await page.goto("chrome-extension://" + id + "/index.html?panel=1");
    try {
      await page.getByRole("button", { name: "Practice", exact: true }).click();
      const loading = page
        .getByRole("status")
        .filter({ hasText: "Loading skill tree" });
      await expect(loading.locator("img")).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath("loading-skill-tree.png"),
      });
    } finally {
      treeLoad.resolve(undefined);
    }

    const tree = page.getByRole("region", { name: "Curriculum skill tree" });
    await expect(
      page.getByRole("heading", { name: "Skill tree", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".practice-tree__evidence")).toHaveCount(0);
    await expect(tree.getByRole("combobox")).toHaveCount(0);
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
      await expect(tree.getByRole("heading", { name: title })).toBeVisible();
      await expect(units.getByRole("listitem")).toHaveCount(count);
    }
    const forkPuzzle = page.getByRole("button", {
      name: "Attack two targets",
      exact: true,
    });
    await page.setViewportSize({ width: 320, height: 360 });
    await forkPuzzle.evaluate((node) => {
      node.scrollIntoView({ block: "center", behavior: "instant" });
    });
    const nodeTop = (await forkPuzzle.boundingBox())?.y;
    if (nodeTop === undefined) throw new Error("Missing skill node");
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await forkPuzzle.click();
      await expect(forkPuzzle).toHaveAttribute("aria-busy", "true");
      await expect(forkPuzzle.getByText("Opening puzzle…")).toBeVisible();
      const mark = forkPuzzle.locator(".loading-mark img");
      await expect(mark).toBeVisible();
      await expect(mark).toHaveCSS("animation-name", "none");
      await forkPuzzle.screenshot({
        path: test.info().outputPath("loading-puzzle.png"),
      });
    } finally {
      puzzleLoad.resolve(undefined);
      await page.emulateMedia({ reducedMotion: null });
    }
    await expect(page).toHaveURL(/#practice\//);
    await page.setViewportSize({ width: 320, height: 760 });
    await expect(
      page
        .getByRole("banner")
        .getByRole("button", { name: "Back to Practice" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Find the first move" }),
    ).toHaveCount(0);
    await expect(page.locator(".rook-exploration__heading p")).toHaveCount(0);
    const rook = page.getByRole("region", { name: "Explore with Rook" });
    const motif = rook.getByRole("status", { name: "Rook’s guidance" });
    await expect(motif).toHaveText(
      "RookFind a move or preparation that attacks two targets.",
    );
    await expect(rook.getByLabel("Ask Rook")).toBeVisible();
    const hint = rook.getByRole("button", { name: "Hint", exact: true });
    await expect(
      rook.getByRole("gridcell", { name: /Rook highlight/ }),
    ).toHaveCount(0);
    await hint.click();
    await expect(
      rook.getByRole("gridcell", { name: /Rook hint/ }).first(),
    ).toBeVisible();
    await expect(rook.locator("[data-move-cue-arrow]")).toHaveCount(0);
    await rook.getByRole("button", { name: "More hint", exact: true }).click();
    await expect(
      rook.getByRole("gridcell", {
        name: /White knight on g4.*Rook highlight/,
      }),
    ).toBeVisible();
    await expect(rook.locator("[data-move-cue-arrow]")).toHaveCount(0);
    await rook.getByRole("button", { name: "Next move", exact: true }).click();
    await expect(
      rook.getByRole("gridcell", { name: /White knight on f6/ }),
    ).toBeVisible();
    await rook
      .getByRole("button", { name: "Previous move", exact: true })
      .click();
    await expect(
      rook.getByRole("gridcell", { name: /White knight on g4/ }),
    ).toBeVisible();
    await rook.getByLabel("Ask Rook").fill("What is the material balance?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(rook.getByRole("log")).toContainText(
      /material is level|ahead by/i,
    );
    await expect(
      rook.getByRole("gridcell", { name: /White knight on g4/ }),
    ).toBeVisible();
    const first = page.url();
    await page.setViewportSize({ width: 320, height: 360 });
    await page.getByRole("button", { name: "Back to Practice" }).click();
    await expect(forkPuzzle).toBeFocused();
    await expect(forkPuzzle).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () =>
        Math.abs(((await forkPuzzle.boundingBox())?.y ?? Infinity) - nodeTop),
      )
      .toBeLessThan(2);
    await page.setViewportSize({ width: 320, height: 760 });
    await forkPuzzle.click();
    await expect(page).toHaveURL(first);
    await rook.getByRole("gridcell", { name: /White knight on g4/ }).click();
    await rook
      .getByRole("gridcell", { name: /Empty h6, legal destination/ })
      .click();
    const clue = rook.getByRole("status").filter({
      hasText: "What were you trying to do with Nh6?",
    });
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(clue.getByText("Rook", { exact: true })).toBeVisible();
      await expect(clue).toBeInViewport();
      await expect(
        rook.getByRole("button", { name: "Next move" }),
      ).toBeInViewport();
      await page.screenshot({
        path: test.info().outputPath(`practice-clue-${String(width)}.png`),
      });
    }
    await page.setViewportSize({ width: 320, height: 760 });
    await expect(
      rook.getByRole("gridcell", { name: /White queen on b7/ }),
    ).toBeVisible();
    await expect(rook.getByText(/Qxb7/)).toHaveCount(0);
    await rook.getByRole("button", { name: "Next move" }).click();
    await expect(
      rook
        .getByRole("log")
        .getByText(/^You played Nh6\. Black can take the queen on b7\./),
    ).toBeVisible();
    await rook.getByRole("button", { name: "Done" }).click();
    await rook.getByRole("button", { name: "Next move" }).click();
    await expect(
      rook.getByRole("gridcell", { name: /Black queen on b7/ }),
    ).toBeVisible();
    await rook.getByRole("button", { name: "Rewind", exact: true }).click();
    await expect(
      rook.getByText("Find a move or preparation that attacks two targets.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(clue).toHaveCount(0);
    await page.getByRole("gridcell", { name: /White knight on g4/ }).click();
    await page.getByRole("gridcell", { name: /Black knight on f6/ }).click();
    await expect(page.getByText("Good move", { exact: true })).toBeVisible();
    await expect(motif).toHaveCount(0);
    await expect(
      rook.getByRole("gridcell", { name: /Empty g4/ }),
    ).toBeVisible();
    await expect(
      rook.getByRole("group", { name: "Rook’s move explanation" }).first(),
    ).toBeVisible();

    await rook.getByRole("button", { name: "Compare moves" }).click();
    const comparison = rook.getByRole("group", { name: "Move comparison" });
    const solved = comparison.getByRole("button", { name: "Solved · Nxf6+" });
    const earlier = comparison.getByRole("button", {
      name: "Earlier try · Nh6",
    });
    await expect(solved).toHaveAttribute("aria-pressed", "true");
    const board = rook.getByRole("grid");
    const f7 = board.getByRole("gridcell", {
      name: /Empty f7.*control lost by the solved move/,
    });
    const knightArrow = board.locator('[data-control-arrow="h6:f7"]');
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await solved.click();
      await f7.click();
      await expect(knightArrow).toHaveCount(0);
      await earlier.click();
      await expect(f7).toHaveAttribute("aria-selected", "true");
      await expect(knightArrow).toHaveCount(1);
      await expect(comparison).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath(`practice-comparison-${String(width)}.png`),
      });
    }
    await page.setViewportSize({ width: 320, height: 760 });
    await comparison.getByRole("button", { name: "Done" }).click();
    // Stockfish may answer the check with any equal reply; White moves next.
    await expect(
      board.getByRole("gridcell", { name: /^Black .*last move ended here/ }),
    ).toBeVisible();
    await expect(
      board.getByRole("gridcell", { name: /White rook on a1/ }),
    ).toBeEnabled();
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
    await expect(
      page.getByRole("button", { name: "Back to Practice" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to Practice" }).click();

    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await tree.screenshot({
        path: test.info().outputPath(`curriculum-${String(width)}.png`),
      });
    }
    await page.setViewportSize({ width: 320, height: 760 });
    await page.getByText("Read the board", { exact: true }).click();
    await expect(
      page
        .getByRole("banner")
        .getByRole("button", { name: "Back to Practice" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Find the first move" }),
    ).toHaveCount(0);
    await expect(page.locator(".rook-exploration__heading p")).toHaveCount(0);

    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(
        page.getByRole("grid", { name: "Training board, White side" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(
        page.getByRole("meter", { name: "Stockfish evaluation" }),
      ).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath("exercise-" + String(width) + ".png"),
      });
    }
    await page.reload();
    await expect(motif).toContainText(
      "Recognize a legal special move and check what it changes.",
    );
    await page.getByRole("gridcell", { name: /White king on e1/ }).click();
    await page
      .getByRole("gridcell", { name: /Empty g1, legal destination/ })
      .click();
    await expect(page.getByText("Good move", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Compare moves" }),
    ).toHaveCount(0);
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
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Back to Review" })
      .click();
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    const next = page.getByRole("button", {
      name: "See the opponent’s next threat, recommended from your games",
    });
    await expect(next).toHaveAttribute("aria-pressed", "true", {
      timeout: 20_000,
    });
    await expect(page.locator(".practice-tree__evidence")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Deliver a simple mate", exact: true }),
    ).toBeVisible();
    const tree = page.getByRole("region", { name: "Curriculum skill tree" });
    await expect(
      tree.getByRole("group", {
        name: "See the opponent’s next threat exercises",
      }),
    ).toHaveCount(0);
    const lessonMenu = tree.getByLabel("More for this skill");
    const openLessons = tree.getByRole("button", {
      name: "Lessons",
      exact: true,
    });
    await expect(
      page.getByText("Game analysis by skill", { exact: true }),
    ).toHaveCount(0);
    await expect(
      tree.getByRole("button", { name: "Play puzzle", exact: true }),
    ).toHaveCount(0);
    await expect(tree.getByText(/g4/)).toHaveCount(0);
    await next.click();
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
    await expect(next).toBeVisible();
    await next.click();
    await expect(page).not.toHaveURL(gamePuzzle);
    await expect(
      page.getByRole("grid", { name: /Training board/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to Practice" }).click();
    await expect(next).toBeFocused();
    await expect(openLessons).toBeHidden();
    await lessonMenu.click();
    await openLessons.click();
    const lessons = page.getByRole("region", {
      name: "Lessons and position practice",
    });
    const lesson = lessons.getByRole("button", { name: /^Play Move/ }).first();
    const thumbnail = lessons.locator(".skill-challenge-list__diagram").first();
    await expect(thumbnail).toBeVisible();
    const startingPieces = await thumbnail
      .locator(".chess-board__piece")
      .allTextContents();
    expect(startingPieces.length).toBeGreaterThan(0);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(thumbnail).toBeVisible();
      await expect(lesson).toBeVisible();
      expect((await lesson.boundingBox())?.width).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await lessons.screenshot({
        path: test
          .info()
          .outputPath("lesson-previews-" + String(width) + ".png"),
      });
    }
    await page.setViewportSize({ width: 320, height: 760 });
    await lesson.click();
    const challenge = page.getByRole("region", { name: "Lesson challenge" });
    await expect(challenge).toBeVisible();
    await expect(challenge.locator(".chess-board__piece")).toHaveText(
      startingPieces,
    );
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Back to challenges" })
      .click();
    await expect(lessons).toBeVisible();
    await page
      .getByRole("button", { name: "Back to Skill tree", exact: true })
      .click();
    await expect(openLessons).toBeHidden();

    await expect(next).toBeVisible();
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

test("recommends the fork unit for a missed knight fork in an imported game", async () => {
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
    // Lichess puzzle 0Uxzm: Ng5+ forks the king and queen, White plays gxf4.
    await page
      .getByLabel("Paste completed PGN games")
      .fill(
        '[SetUp "1"]\n[FEN "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35"]\n[Result "0-1"]\n\n35. gxf4 0-1',
      );
    await page.getByRole("radio", { name: "I played White" }).check();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    await expect(page).toHaveURL(/#review\//);
    await expect(page.getByLabel("Ask Rook")).toBeVisible({ timeout: 20000 });
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Back to Review" })
      .click();
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    const recommended = page.getByRole("button", {
      name: "Attack two targets, recommended from your games",
    });
    await expect(recommended).toHaveAttribute("aria-pressed", "true", {
      timeout: 20_000,
    });
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await page
        .getByRole("button", { name: "★ Go to recommended skill" })
        .click();
      await expect(recommended).toBeFocused();
      await expect(recommended).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath("fork-recommended-" + String(width) + ".png"),
      });
    }
    await recommended.click();
    await expect(
      page.getByRole("gridcell", { name: "White knight on f3" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
