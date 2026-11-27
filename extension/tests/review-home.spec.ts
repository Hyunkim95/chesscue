import { chromium, expect, test, type Locator } from "@playwright/test";
import { resolve } from "node:path";

test("keeps the board, controls and composer aligned across board screens", async () => {
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
    const url = "chrome-extension://" + id + "/index.html?panel=1";
    const controls = page.locator(".board-action-row--anchored");
    const askRook = page.getByRole("textbox", {
      name: /^(Ask|Message) Rook$/,
    });
    async function boardBounds(board: Locator, screen: string) {
      const bounds = [];
      for (const width of [320, 420]) {
        await page.setViewportSize({ width, height: 760 });
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await expect(board).toBeInViewport({ ratio: 1 });
        const box = await board.boundingBox();
        if (!box) throw new Error("Missing board");
        if (screen === "lesson") {
          bounds.push({ board: box });
        } else {
          await expect(askRook).toBeInViewport();
          bounds.push({
            board: box,
            controlsTop: (await controls.boundingBox())?.y,
            composerTop: (await askRook.boundingBox())?.y,
          });
        }
        await page.screenshot({
          path: test.info().outputPath(`${screen}-${String(width)}.png`),
        });
      }
      return bounds;
    }

    await page.goto(url + "#play-mode");
    await page.getByRole("button", { name: "Coached", exact: true }).click();
    await expect(page.getByRole("button", { name: "Next move" })).toBeEnabled();
    const play = await boardBounds(
      page.getByRole("grid", { name: "Chess board, White side" }),
      "coached",
    );
    const composer = page.getByRole("textbox", { name: "Message Rook" });
    const conversation = page.getByRole("log", { name: "Messages with Rook" });
    const composerBefore = await composer.boundingBox();
    await expect(composer).toBeInViewport();
    await page.getByRole("button", { name: "Next move", exact: true }).click();
    const hint = page.getByRole("status", { name: "Rook hint" });
    await expect(hint).toContainText("I’d play");
    const hintBefore = await hint.boundingBox();
    const balance = page.getByRole("group", { name: "Board balance" });
    const balanceBefore = await balance.boundingBox();
    expect(await composer.boundingBox()).toEqual(composerBefore);
    await expect(conversation).toHaveCount(0);
    await page.getByRole("button", { name: "Discuss position" }).click();
    await expect(composer).toBeFocused();
    await expect(conversation).toBeAttached();
    expect(await composer.boundingBox()).toEqual(composerBefore);
    expect(await hint.boundingBox()).toEqual(hintBefore);
    expect(await balance.boundingBox()).toEqual(balanceBefore);
    await page.getByRole("button", { name: "Hide conversation" }).click();
    await expect(conversation).toHaveCount(0);
    expect(await composer.boundingBox()).toEqual(composerBefore);
    await composer.fill("What should I watch for?");
    const openComposer = await composer.boundingBox();
    expect(openComposer).toEqual(composerBefore);
    const openBoard = await page
      .getByRole("grid", { name: "Chess board, White side" })
      .boundingBox();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(conversation).toContainText("What should I watch for?");
    await expect(conversation).toContainText("I haven’t flagged a move yet");
    expect(await composer.boundingBox()).toEqual(openComposer);
    expect(
      await page
        .getByRole("grid", { name: "Chess board, White side" })
        .boundingBox(),
    ).toEqual(openBoard);
    await page.goto(url + "#study/rook");
    await page.getByText("More options", { exact: true }).click();
    await page.getByRole("button", { name: "Explore position" }).click();
    expect(
      await boardBounds(
        page.getByRole("grid", { name: "Study board" }),
        "study",
      ),
    ).toEqual(play);
    await expect(composer).toBeInViewport();
    const studyBefore = await composer.boundingBox();
    const studyCue = page.locator(".study-board__cue");
    await expect(studyCue).toBeVisible();
    const studyCueBefore = await studyCue.boundingBox();
    const studyConversation = page.getByRole("log", {
      name: "Study conversation",
    });
    await expect(studyConversation).toHaveCount(0);
    await page.getByRole("button", { name: "Discuss position" }).click();
    await expect(composer).toBeFocused();
    await expect(studyConversation).toBeAttached();
    expect(await composer.boundingBox()).toEqual(studyBefore);
    expect(await studyCue.boundingBox()).toEqual(studyCueBefore);
    await composer.fill("What is the material balance?");
    const studyComposer = await composer.boundingBox();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(studyConversation.locator(".rook-chat__turn")).toBeVisible();
    expect(await composer.boundingBox()).toEqual(studyComposer);
    await page.getByRole("button", { name: "Back to roadmap" }).click();
    await page
      .getByRole("button", { name: /^Play / })
      .first()
      .click();
    expect(
      await boardBounds(
        page.getByRole("grid", { name: "Challenge board" }),
        "lesson",
      ),
    ).toEqual(play.map(({ board }) => ({ board })));
    await page.goto(url + "#skill-tree");
    await page
      .getByRole("button", { name: "Attack two targets", exact: true })
      .click();
    expect(
      await boardBounds(
        page.getByRole("grid", { name: /Training board/ }),
        "practice",
      ),
    ).toEqual(play);
    await page.goto(url + "#import");
    await page
      .getByLabel("Paste completed PGN games")
      .fill('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    await page.getByRole("radio", { name: "I played White" }).check();
    await page
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    expect(
      await boardBounds(
        page.getByRole("grid", { name: /Training board/ }),
        "review",
      ),
    ).toEqual(play);
  } finally {
    await context.close();
  }
});

test("opens Review first and keeps Practice, Play and import within reach", async () => {
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
    await page.goto("chrome-extension://" + id + "/index.html?panel=1");

    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const header = page.getByRole("banner");
    const brand = header.getByRole("button", { name: "ChessCue" });
    await expect(brand).toHaveText("");
    await expect(brand.locator("img")).toHaveAttribute("src", "/favicon.svg");
    await expect(header.getByRole("button", { name: "Account" })).toHaveCSS(
      "border-top-width",
      "0px",
    );
    await expect(
      page.getByRole("heading", { name: "Review", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Review", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("grid")).toHaveCount(0);
    const emptyReview = page.getByRole("region", {
      name: "Review your first game",
    });
    await expect(
      emptyReview.getByRole("button", { name: "Import PGN" }),
    ).toBeVisible();
    await expect(emptyReview.locator("img")).toHaveCount(1);
    await page.screenshot({
      path: test.info().outputPath("review-empty-320.png"),
    });

    await expect(nav.getByRole("button", { name: "Import games" })).toHaveCount(
      0,
    );
    await expect(nav.getByRole("button")).toHaveText([
      "Review",
      "Practice",
      "Play",
      "Social",
    ]);
    const radius = await page
      .getByRole("button", { name: "Account", exact: true })
      .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    await expect(page.getByRole("button", { name: "Import PGN" })).toHaveCSS(
      "border-top-left-radius",
      radius,
    );
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      const box = await nav.boundingBox();
      expect(box && Math.round(box.y + box.height)).toBe(760);
      for (const tab of await nav.getByRole("button").all()) {
        const target = await tab.boundingBox();
        expect(target?.height).toBeGreaterThanOrEqual(44);
        expect(target?.width).toBeGreaterThanOrEqual(44);
      }
    }
    await page.setViewportSize({ width: 320, height: 760 });
    const social = nav.getByRole("button", { name: "Social" });
    // An already open extension can lose access to a lazy asset after a rebuild.
    const network = await context.newCDPSession(page);
    await network.send("Network.enable");
    await network.send("Network.setBlockedURLs", { urls: ["*RaceView-*.js"] });
    await social.click();
    await expect(
      page.getByRole("heading", { name: "Elo races" }),
    ).toBeVisible();
    const emptyRace = page.getByRole("region", { name: "Race your friends" });
    // The built extension has a Chrome OAuth client, so it signs in with
    // Chrome's account prompt instead of sending the player to the web app.
    const webRace = emptyRace.getByRole("button", {
      name: "Continue with Google",
    });
    await expect(webRace).toBeVisible();
    // The button stays disabled until the sign-in session is ready.
    await expect(webRace).toBeEnabled();
    await expect(webRace).toHaveCSS("color", "rgb(18, 33, 25)");
    await expect(webRace).toHaveCSS("background-color", "rgb(223, 195, 151)");
    await webRace.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(webRace).toBeFocused();
    await expect(webRace).toHaveCSS("outline-style", "solid");
    await expect(webRace).toHaveCSS("outline-width", "3px");
    await expect(
      emptyRace.getByRole("link", { name: "Open Elo races on the web" }),
    ).toHaveCount(0);
    await expect(emptyRace.locator("img")).toHaveCount(2);
    const raceArt = emptyRace.locator("img").first();
    await expect(raceArt).toHaveCSS("animation-name", "race-piece-orbit");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(raceArt).toHaveCSS("animation-name", "none");
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(webRace).toBeInViewport({ ratio: 1 });
      const welcome = await emptyRace.boundingBox();
      const heading = await page
        .getByRole("heading", { name: "Elo races" })
        .boundingBox();
      const navigationBounds = await nav.boundingBox();
      if (!welcome || !heading || !navigationBounds)
        throw new Error("Missing race sign-in layout");
      expect(
        Math.abs(
          welcome.y +
            welcome.height / 2 -
            (heading.y + heading.height + navigationBounds.y) / 2,
        ),
      ).toBeLessThan(30);
      const target = await webRace.boundingBox();
      expect(target?.height).toBeGreaterThanOrEqual(44);
      expect(target?.width).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath("races-empty-" + String(width) + ".png"),
      });
    }
    await page.emulateMedia({ reducedMotion: null });
    await page.setViewportSize({ width: 320, height: 760 });
    await expect(social).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(social).toHaveAttribute("aria-current", "page");
    await nav.getByRole("button", { name: "Review" }).click();
    const lichess = "https://lichess.org/abcdef12/white";
    await context.route(lichess, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<button id="user_tag">Mira</button><div class="result-wrap"><p class="result"></p></div>',
      }),
    );
    await context.route(
      "https://lichess.org/game/export/abcdef12?**",
      (route) =>
        route.fulfill({
          json: {
            id: "abcdef12",
            variant: "standard",
            status: "mate",
            players: {
              white: { user: { id: "mira", name: "Mira" } },
              black: {},
            },
            pgn: '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
          },
        }),
    );
    const host = await context.newPage();
    await host.goto(lichess);
    await host.bringToFront();
    await expect(
      page.getByText("Finish your Lichess game to review it with Rook."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Review this Lichess game",
        exact: true,
      }),
    ).toHaveCount(0);
    await host.locator(".result").evaluate((result) => {
      result.textContent = "0-1";
    });
    await expect(
      page.getByRole("button", {
        name: "Review this Lichess game",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Review this Lichess game", exact: true })
      .click();
    await page.getByRole("button", { name: "Share game and review" }).click();
    await expect(
      page
        .getByRole("region", { name: "Explore with Rook" })
        .getByLabel("Ask Rook"),
    ).toBeVisible({ timeout: 20000 });
    await host.close();
    await page.getByRole("button", { name: "Back to Review" }).click();
    await expect(
      page.getByRole("button", { name: "Resume last review", exact: true }),
    ).toHaveCount(0);
    const importPgn = page.getByRole("button", {
      name: "Import PGN",
      exact: true,
    });
    await expect(importPgn).toHaveClass("primary-link");
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(importPgn).toBeInViewport();
      await page.screenshot({
        path: test.info().outputPath(`review-home-${String(width)}.png`),
      });
    }
    await importPgn.click();
    await expect(
      page.getByRole("heading", { name: "Import completed PGNs" }),
    ).toBeVisible();

    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      const notice = page.getByText(
        /including player names, comments and variations/,
      );
      await notice.scrollIntoViewIfNeeded();
      await expect(notice).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath("pgn-sharing-" + String(width) + ".png"),
      });
    }
    await nav.getByRole("button", { name: "Practice", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Skill tree", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Shared puzzle library", { exact: true }),
    ).toHaveCount(0);

    await nav.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Game mode" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Rated", exact: true }),
    ).toHaveCSS("border-top-left-radius", radius);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      const rated = await page
        .getByRole("button", { name: "Rated", exact: true })
        .boundingBox();
      const coached = await page
        .getByRole("button", { name: "Coached", exact: true })
        .boundingBox();
      const tabs = await nav.boundingBox();
      if (!rated || !coached || !tabs)
        throw new Error("Missing game mode choices");
      expect(rated.height).toBeGreaterThan(200);
      expect(coached.height).toBeCloseTo(rated.height, 0);
      expect(coached.width).toBeCloseTo(rated.width, 0);
      expect(coached.y).toBeGreaterThan(rated.y + rated.height);
      expect(tabs.y - (coached.y + coached.height)).toBeGreaterThanOrEqual(0);
      expect(tabs.y - (coached.y + coached.height)).toBeLessThan(24);
      await page.screenshot({
        path: test.info().outputPath(`game-mode-${String(width)}.png`),
      });
    }
    await page.setViewportSize({ width: 320, height: 760 });
    const ratedCard = page.getByRole("button", { name: "Rated", exact: true });
    const coachedCard = page.getByRole("button", {
      name: "Coached",
      exact: true,
    });
    await expect(ratedCard.getByText("Resume", { exact: true })).toHaveCount(0);
    await expect(coachedCard.getByText("Resume", { exact: true })).toHaveCount(
      0,
    );
    await ratedCard.click();
    const modeBack = page
      .getByRole("banner")
      .getByRole("button", { name: "Back to game mode" });
    await expect(modeBack).toBeInViewport();
    await expect(page.getByRole("grid", { name: /Chess board/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Discuss position" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Message Rook" }),
    ).toHaveCount(0);
    await expect(nav).toBeHidden();
    await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
    await page.getByRole("gridcell", { name: "Empty e4" }).click();
    await expect(page.getByText("Your move", { exact: true })).toBeVisible();
    await modeBack.click();
    await expect(
      page.getByRole("heading", { name: "Game mode" }),
    ).toBeVisible();
    await expect(nav).toBeVisible();
    await expect(ratedCard.getByText("Resume", { exact: true })).toBeVisible();
    await expect(coachedCard.getByText("Resume", { exact: true })).toHaveCount(
      0,
    );
    await coachedCard.click();
    await page.getByRole("gridcell", { name: "White pawn on d2" }).click();
    await page.getByRole("gridcell", { name: "Empty d4" }).click();
    await expect(page.getByText("Your move", { exact: true })).toBeVisible();
    await modeBack.click();
    await page.reload();
    await expect(ratedCard.getByText("Resume", { exact: true })).toBeVisible();
    await expect(
      coachedCard.getByText("Resume", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("game-mode-resume-320.png"),
    });
    await ratedCard.click();
    await expect(
      page.getByRole("gridcell", { name: "White pawn on e4" }),
    ).toBeVisible();
    await page.getByText("Game details", { exact: true }).click();
    await page
      .getByRole("button", { name: "Resign game", exact: true })
      .click();
    await expect(page).toHaveURL(/#result\//);
    await nav.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      coachedCard.getByText("Resume", { exact: true }),
    ).toBeVisible();
    await expect(ratedCard.getByText("Resume", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Elo races", exact: true }),
    ).toHaveCount(0);
    await social.click();
    await expect(
      page.getByRole("heading", { name: "Elo races", exact: true }),
    ).toBeVisible();
    await expect(social).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Elo races", exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("finds and reopens an older completed game offline from Review", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    locale: "en-US",
    timezoneId: "America/New_York",
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
    await page.goto("chrome-extension://" + id + "/index.html?panel=1");
    await page.getByRole("button", { name: "Import PGN" }).click();
    await page
      .getByLabel("Paste completed PGN games")
      .fill(
        [
          '[Event "Club"]\n[White "Maya"]\n[Black "Me"]\n[UTCDate "2024.04.02"]\n[UTCTime "02:42:00"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
          '[Event "Club"]\n[White "Jules"]\n[Black "Me"]\n[Date "2024.06.10"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
          '[Event "Club"]\n[White "Sam"]\n[Black "Me"]\n[Result "1/2-1/2"]\n\n1. d4 d5 1/2-1/2',
        ].join("\n\n"),
      );
    await page.getByRole("radio", { name: "I played Black" }).check();
    await page
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    await expect(
      page.getByText("3 accepted, 0 duplicate, 0 rejected"),
    ).toBeVisible();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await page.reload();
    const list = page.getByRole("list", { name: "Completed games" });
    await expect(list).toBeVisible();
    const rows = list.getByRole("button");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText(/Sam.*Draw.*Imported/);
    await expect(rows.nth(1)).toContainText(/Jules.*Loss.*Jun 10, 2024$/);
    await expect(rows.nth(2)).toContainText(/Maya.*Win.*Apr 1, 2024.*10:42/);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(rows.last()).toBeInViewport();
      await page.screenshot({
        path: test.info().outputPath("saved-games-" + String(width) + ".png"),
      });
    }
    await rows.getByText("vs. Maya").click();
    const rook = page.getByRole("region", { name: "Explore with Rook" });
    await expect(rook.getByLabel("Ask Rook")).toBeVisible({ timeout: 20000 });
    const header = page.getByRole("banner");
    const back = header.getByRole("button", { name: "Back to Review" });
    await expect(back).toBeInViewport();
    const tabs = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(tabs).toBeHidden();
    await expect(header.getByRole("button", { name: "ChessCue" })).toBeHidden();
    await expect(page.getByText("vs. Maya · Win", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      rook.getByRole("heading", { name: "Explore with Rook" }),
    ).toHaveCount(0);
    await expect(rook.getByText(/^You’re Black · /)).toHaveCount(0);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      const target = await back.boundingBox();
      expect(target?.width).toBeGreaterThanOrEqual(44);
      expect(target?.height).toBeGreaterThanOrEqual(44);
      const board = rook.getByRole("grid");
      await expect(board).toBeInViewport({ ratio: 1 });
      const controls = rook.getByRole("group", { name: "Board playback" });
      const composer = rook.getByRole("textbox", { name: "Ask Rook" });
      await expect(composer).toBeInViewport({ ratio: 1 });
      const boardBox = await board.boundingBox();
      const controlsBox = await controls.boundingBox();
      const composerBox = await composer.boundingBox();
      const stockfish = rook.getByRole("meter", {
        name: "Stockfish evaluation",
      });
      await expect(stockfish).toBeVisible();
      const stockfishBox = await stockfish.boundingBox();
      if (!boardBox || !controlsBox || !composerBox)
        throw new Error("Missing review controls");
      await controls.getByRole("button", { name: "Discuss position" }).click();
      expect(await composer.boundingBox()).toEqual(composerBox);
      expect(await controls.boundingBox()).toEqual(controlsBox);
      expect(await board.boundingBox()).toEqual(boardBox);
      expect(await stockfish.boundingBox()).toEqual(stockfishBox);
      await controls.getByRole("button", { name: "Hide conversation" }).click();
      expect(await composer.boundingBox()).toEqual(composerBox);
      await page.screenshot({
        path: test.info().outputPath(`rook-review-${String(width)}.png`),
      });
    }
    await expect(
      rook.getByText("Replay the full game", { exact: true }),
    ).toHaveCount(0);
    await expect(rook.getByRole("grid")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Game summary" }),
    ).toHaveCount(0);
    await back.click();
    await expect(rows).toHaveCount(3);
    await expect(tabs).toBeVisible();
    await expect(
      header.getByRole("button", { name: "ChessCue" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
