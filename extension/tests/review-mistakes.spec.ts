import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("queues the move tried during a PGN review once and opens its retry offline", async () => {
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
    const page = await context.newPage();
    await page.goto(
      "chrome-extension://" + id + "/index.html?panel=1&ui=classic",
    );
    const practice = page.getByRole("button", {
      name: "Practice",
      exact: true,
    });
    await page.getByRole("button", { name: "Import PGN" }).click();
    await page
      .getByRole("textbox", { name: "Paste completed PGN games" })
      .fill('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    await page.getByRole("radio", { name: "I played White" }).check();
    await page
      .getByRole("button", { name: "Import games", exact: true })
      .click();

    const rook = page.getByRole("region", { name: "Explore with Rook" });
    const intro = rook.getByRole("group", { name: "Game replay intro" });
    const mainBoard = rook.getByRole("grid", {
      name: "Training board, White side",
    });
    await expect(rook.getByLabel("Ask Rook")).toBeVisible();
    await expect(intro).toHaveCount(0);
    await expect(
      rook.getByText("You missed a better move here. Can you find it?", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      mainBoard.getByRole("gridcell", { name: /White pawn on f3/ }),
    ).toBeEnabled();
    await expect(
      mainBoard.getByRole("gridcell", {
        name: /Black pawn on e5, last move ended here/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Game summary" }),
    ).toHaveCount(0);
    const reviewUrl = page.url();
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(mainBoard).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath("review-turning-point-" + String(width) + ".png"),
      });
    }
    await expect(
      rook
        .getByRole("group", { name: "Board playback" })
        .getByText("White to move", { exact: true }),
    ).toBeVisible();
    const prompt = rook.getByRole("status", { name: "Rook’s guidance" });
    await expect(prompt).toContainText(
      "You missed a better move here. Can you find it?",
    );
    await expect(prompt).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 320, height: 760 });
    await expect(
      rook.getByText("Replay the full game", { exact: true }),
    ).toHaveCount(0);
    await expect(rook.getByRole("grid")).toHaveCount(1);
    await expect(page).toHaveURL(reviewUrl);
    const savedMistakes = () =>
      page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const open = indexedDB.open("adaptive-chess-tutor");
          open.onsuccess = () => {
            resolve(open.result);
          };
          open.onerror = () => {
            reject(open.error ?? new Error("Cannot open review storage"));
          };
        });
        try {
          return await new Promise<number>((resolve, reject) => {
            const count = db
              .transaction("reviewMistakes")
              .objectStore("reviewMistakes")
              .count();
            count.onsuccess = () => {
              resolve(count.result);
            };
            count.onerror = () => {
              reject(count.error ?? new Error("Cannot count review mistakes"));
            };
          });
        } finally {
          db.close();
        }
      });
    expect(await savedMistakes()).toBe(0);

    await page.reload();
    await expect(rook.getByLabel("Ask Rook")).toBeVisible();
    await expect(intro).toHaveCount(0);
    let savedSkill = "";
    let savedStage = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      await rook.getByRole("gridcell", { name: "White pawn on g2" }).click();
      await rook.getByRole("gridcell", { name: /Empty g4/ }).click();
      await expect(
        rook.getByText("That’s the move you played. Try another."),
      ).toBeVisible();
      await expect(
        rook.getByRole("gridcell", { name: "White pawn on g2" }),
      ).toBeEnabled();
      await expect.poll(savedMistakes).toBe(1);
      const toast = page.getByRole("status", { name: "Practice update" });
      if (attempt === 0) {
        await expect(toast.getByText("Saved g4 to Practice")).toBeVisible();
        const path = await toast
          .locator(".rook-practice-toast__path")
          .innerText();
        [savedStage = "", savedSkill = ""] = path.split(" › ");
        expect(savedStage).not.toBe("");
        expect(savedSkill).not.toBe("");
        for (const width of [320, 420]) {
          await page.setViewportSize({ width, height: 760 });
          await expect(toast).toBeInViewport({ ratio: 1 });
          await expect(mainBoard).toBeInViewport({ ratio: 1 });
          await expect(
            rook.getByRole("textbox", { name: "Ask Rook" }),
          ).toBeInViewport({ ratio: 1 });
          await expect(
            page.getByRole("navigation", { name: "Primary navigation" }),
          ).toBeHidden();

          await page.screenshot({
            path: test.info().outputPath(`practice-toast-${String(width)}.png`),
          });
        }
        await page.setViewportSize({ width: 320, height: 760 });
        await expect(toast).toBeEmpty({ timeout: 10000 });
      } else {
        await expect(toast).toBeEmpty();
      }
    }

    await rook.getByRole("gridcell", { name: "White knight on b1" }).click();
    await rook.getByRole("gridcell", { name: /Empty c3/ }).click();
    await expect(rook.getByText("You found a better move.")).toBeVisible();
    const explanation = rook
      .getByRole("log")
      .getByText(/forced mate against g4, starting with Qh4#/);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(explanation).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath("better-move-explanation-" + String(width) + ".png"),
      });
    }
    await expect(
      rook.getByRole("gridcell", { name: /White knight on c3/ }),
    ).toBeVisible();
    const discussion = rook.getByRole("region", { name: "Discuss with Rook" });
    const compare = discussion.getByRole("button", { name: "Compare moves" });
    await compare.click();
    const comparison = discussion.getByRole("group", {
      name: "Move comparison",
    });
    await expect(discussion.getByRole("log")).toBeVisible();
    const selectedExplanation = discussion.getByRole("status", {
      name: "Selected move explanation",
    });
    await expect(selectedExplanation).toContainText("Checked reply:");
    const better = comparison.getByRole("button", {
      name: "Better · Nc3",
    });
    const recorded = comparison.getByRole("button", { name: "Original · g4" });
    await expect(
      comparison.getByText("+ Nc3 only", { exact: true }),
    ).toBeVisible();
    await expect(
      comparison.getByText("− g4 only", { exact: true }),
    ).toBeVisible();
    await expect(
      mainBoard.locator('[data-move-cue-arrow="b1:c3"]'),
    ).toBeVisible();
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await better.click();
      const betterBounds = await better.boundingBox();
      const recordedBounds = await recorded.boundingBox();
      expect(betterBounds?.y).toBe(recordedBounds?.y);
      const d5 = mainBoard.getByRole("gridcell", {
        name: /Empty d5.*control gained by the better move/,
      });
      await d5.click();
      const inspection = rook.getByRole("status", { name: "Square control" });
      await expect(inspection.getByText("Control of d5")).toBeVisible();
      await expect(
        mainBoard.locator('[data-control-arrow="c3:d5"]'),
      ).toHaveCount(1);
      await expect(
        inspection.getByRole("img", { name: "White knight on c3" }),
      ).toBeVisible();
      await expect(inspection.getByText("No pieces")).toBeVisible();
      await expect(
        mainBoard.getByRole("gridcell", {
          name: /White knight on c3.*controls d5/,
        }),
      ).toBeVisible();
      await expect(inspection).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath("better-move-controls-" + String(width) + ".png"),
      });
      const beforeSwitch = await mainBoard.evaluate((board) => [
        board.clientWidth,
        board.clientHeight,
      ]);
      await recorded.click();
      await expect(selectedExplanation).toContainText("Qh4# is checkmate");
      await expect(discussion.getByRole("log")).toBeVisible();
      expect(
        await mainBoard.evaluate((board) => [
          board.clientWidth,
          board.clientHeight,
        ]),
      ).toEqual(beforeSwitch);
      await expect(mainBoard.locator("[data-control-arrow]")).toHaveCount(0);
      await expect(d5).toHaveAttribute("aria-selected", "true");
      await expect(inspection.getByText("Control of d5")).toBeVisible();
      await expect(
        mainBoard.getByRole("gridcell", { name: /controls d5/ }),
      ).toHaveCount(0);
      await mainBoard
        .getByRole("gridcell", {
          name: /Empty h5.*control lost by the better move/,
        })
        .click();
      await expect(inspection.getByText("Control of h5")).toBeVisible();
      await expect(
        mainBoard.locator('[data-control-arrow="g4:h5"]'),
      ).toHaveCount(1);
      await expect(
        inspection.getByRole("img", { name: "White pawn on g4" }),
      ).toBeVisible();
      await expect(inspection.getByText("No pieces")).toBeVisible();
      await expect(
        mainBoard.getByRole("gridcell", {
          name: /White pawn on g4.*controls h5/,
        }),
      ).toBeVisible();
      await expect(
        mainBoard.getByRole("gridcell", { name: "Empty e4", exact: true }),
      ).toBeVisible();
      await expect(
        mainBoard.getByRole("gridcell", { name: /control gained/ }),
      ).toHaveCount(3);
      await expect(
        mainBoard.getByRole("gridcell", { name: /control lost/ }),
      ).toHaveCount(2);
      await page.screenshot({
        path: test
          .info()
          .outputPath("game-move-controls-" + String(width) + ".png"),
      });
    }
    await comparison.getByRole("button", { name: "Done" }).click();
    await expect(
      mainBoard.getByRole("gridcell", { name: /White knight on c3/ }),
    ).toBeEnabled();
    await expect.poll(savedMistakes).toBe(1);
    await context.setOffline(true);
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Back to Review" })
      .click();
    await practice.click();
    await page
      .getByRole("list", { name: savedStage + " units" })
      .getByRole("button", { name: new RegExp("^" + savedSkill) })
      .click();
    await expect(page).toHaveURL(/#practice\/review-mistake-/);
    await expect(
      page.getByRole("button", { name: "Back to Practice" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Find the first move" }),
    ).toHaveCount(0);
    await expect(page.locator(".rook-exploration__heading p")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("gridcell", { name: "White pawn on g2" }),
    ).toBeVisible();
    await expect(
      page.getByRole("gridcell", { name: "Empty g4" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("starts White review on White's turn when the score only records a Black move", async () => {
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
    const page = await context.newPage();
    await context.setOffline(true);
    await page.goto(
      "chrome-extension://" + id + "/index.html?panel=1&ui=classic#import",
    );
    await page
      .getByLabel("Paste completed PGN games")
      .fill(
        '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"]\n[Result "1/2-1/2"]\n\n1... e5 1/2-1/2',
      );
    await page.getByRole("radio", { name: "I played White" }).check();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    const rook = page.getByRole("region", { name: "Explore with Rook" });
    await expect(
      rook
        .getByRole("group", { name: "Board playback" })
        .getByText("White to move", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      rook.getByRole("gridcell", { name: /Black pawn on e5/ }),
    ).toBeVisible();

    await page.goto(
      "chrome-extension://" + id + "/index.html?panel=1&ui=classic#import",
    );
    await page
      .getByLabel("Paste completed PGN games")
      .fill(
        '[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"]\n[Result "0-1"]\n\n2... Qh4# 0-1',
      );
    await page.getByRole("radio", { name: "I played White" }).check();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    await expect(
      rook.getByText("You missed a better move here. Can you find it?", {
        exact: true,
      }),
    ).toHaveCount(0);
    const replay = page.getByRole("region", { name: "Full game replay" });
    await expect(replay).toBeVisible();
    await expect(rook).toHaveCount(0);
    await replay.getByRole("button", { name: "Next move" }).click();
    await expect(
      replay.getByRole("gridcell", { name: /Black queen on h4/ }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("explains a missed knight fork from the checked line, offline", async () => {
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
    await page.goto(
      "chrome-extension://" + id + "/index.html?panel=1&ui=classic#import",
    );
    // Lichess puzzle 0Uxzm: Nxg5+ forks the king and queen, White plays gxf4.
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
    const rook = page.getByRole("region", { name: "Explore with Rook" });
    await expect(
      rook.getByText("You missed a better move here. Can you find it?", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await rook.getByRole("gridcell", { name: "White king on e2" }).click();
    await rook.getByRole("gridcell", { name: /Empty d1/ }).click();
    await expect(
      rook.getByText(
        "Kd1 is weaker than your game move gxf4. Try another move.",
      ),
    ).toBeVisible({ timeout: 20_000 });
    await rook.getByRole("button", { name: "Why not Kd1?" }).click();
    await rook.getByRole("button", { name: "Next move" }).click();
    await rook.getByRole("button", { name: "Done" }).click();
    await rook.getByRole("button", { name: "Show stronger line" }).click();
    const explanation = rook
      .getByRole("group", { name: "Rook’s line explanation" })
      .last();
    await expect(explanation).toContainText(
      /Attack two targets\. Nxg5\+ attacks the black king on f7 and the black queen on e6 at the same time\. After Black replies \w+, Nxe6 takes the black queen on e6\./,
      { timeout: 25_000 },
    );
    await expect(explanation).toHaveAttribute(
      "data-wording-version",
      "missed-line-facts/1",
    );
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await explanation.scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath("missed-fork-explanation-" + String(width) + ".png"),
      });
    }
  } finally {
    await context.close();
  }
});

test("never says a piece gained the square it just left", async () => {
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
    await page.goto(
      "chrome-extension://" + id + "/index.html?panel=1&ui=classic#import",
    );
    // Rb8 holds the draw; the game move Kg1 loses about 4.4 pawns.
    await page
      .getByLabel("Paste completed PGN games")
      .fill(
        '[SetUp "1"]\n[FEN "7R/8/8/7p/4k1p1/6P1/r7/5K2 w - - 4 74"]\n[Result "0-1"]\n\n74. Kg1 0-1',
      );
    await page.getByRole("radio", { name: "I played White" }).check();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    const rook = page.getByRole("region", { name: "Explore with Rook" });
    await expect(
      rook.getByText("You missed a better move here. Can you find it?", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await rook.getByRole("gridcell", { name: "White rook on h8" }).click();
    await rook.getByRole("gridcell", { name: /Empty b8/ }).click();
    await expect(rook.getByText("You found a better move.")).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({
      path: test.info().outputPath("rook-left-square-320.png"),
    });
    await expect(page.getByText(/now covers h8/)).toHaveCount(0);
    await expect(
      page
        .getByText(
          /From b8, the rook now covers b7\. That square was outside its reach on h8\./,
        )
        .first(),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("asks about a hung piece, then keeps the warning and compares moves", async () => {
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
    await page.goto(
      "chrome-extension://" + id + "/index.html?panel=1&ui=classic#import",
    );
    await page
      .getByLabel("Paste completed PGN games")
      .fill(
        '[SetUp "1"]\n[FEN "r5k1/5pp1/1p5p/1N2p3/2b1P3/4R1P1/3r2BP/2R4K w - - 0 33"]\n[Result "1/2-1/2"]\n\n33. Ra3 1/2-1/2',
      );
    await page.getByRole("radio", { name: "I played White" }).check();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    const rook = page.getByRole("region", { name: "Explore with Rook" });
    const board = rook.getByRole("grid", {
      name: "Training board, White side",
    });
    await expect(
      board.getByRole("gridcell", { name: /White knight on b5/ }),
    ).toBeEnabled({ timeout: 20_000 });
    await board.getByRole("gridcell", { name: /White knight on b5/ }).click();
    await board.getByRole("gridcell", { name: /Empty d6/ }).click();
    const question = rook.getByText("What were you trying to do with Nd6?");
    await expect(question).toBeVisible({ timeout: 20_000 });
    await expect(rook.getByText(/Black can take the knight/)).toHaveCount(0);
    // The Practice notice waits for the reply so it doesn't answer Rook.
    await expect(rook.getByText("Saved Nd6 to Practice")).toHaveCount(0);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(question).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath("mistake-question-" + String(width) + ".png"),
      });
    }
    await page.setViewportSize({ width: 320, height: 760 });
    await rook.getByLabel("Ask Rook").fill("I wanted to attack the rook");
    await rook.getByLabel("Ask Rook").press("Enter");
    const warning = rook
      .getByRole("log")
      .getByText(/^You played Nd6\. .+I played Rxd6\./s);
    await expect(warning).toBeVisible({ timeout: 20_000 });
    const saved = rook
      .locator(".chess-board")
      .getByRole("status", { name: "Practice update" });
    await expect(saved).toContainText("Saved Nd6 to Practice");
    await expect(saved).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: test.info().outputPath("practice-banner-320.png"),
    });
    const comparison = rook.getByRole("group", { name: "Move comparison" });
    await expect(
      comparison.getByRole("button", { name: /^Original · Nd6/ }),
    ).toHaveAttribute("aria-pressed", "true");
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath("mistake-comparison-" + String(width) + ".png"),
      });
    }
  } finally {
    await context.close();
  }
});
