import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

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
    await expect(
      page.getByRole("heading", { name: "Review", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Review", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(nav.getByRole("button", { name: "Import games" })).toHaveCount(
      0,
    );
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
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("review-home-320.png"),
    });
    await page.getByRole("button", { name: "Import PGN", exact: true }).click();
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
    await page.getByRole("link", { name: "Elo races", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Elo races", exact: true }),
    ).toBeVisible();
    await expect(
      nav.getByRole("button", { name: "Play", exact: true }),
    ).toHaveAttribute("aria-current", "page");
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
    const debrief = page.getByRole("region", { name: "vs. Maya · Win" });
    const rook = page.getByRole("region", { name: "Explore with Rook" });
    await expect(rook.getByLabel("Ask Rook")).toBeVisible({ timeout: 20000 });
    await expect(debrief).toHaveCount(0);
    await page
      .getByRole("button", { name: "Back to game debrief", exact: true })
      .click();

    await expect(debrief).toBeVisible({ timeout: 20000 });
    const matchup = debrief.getByRole("heading", {
      name: "vs. Maya · Win",
      exact: true,
    });
    await expect(
      page.getByRole("heading", { name: "Game debrief" }),
    ).toHaveCount(0);
    await expect(matchup).toBeVisible();
    const reviewBoard = debrief.getByRole("grid", {
      name: "Review board, Black side",
    });
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(reviewBoard).toBeInViewport({ ratio: 1 });
      const backBox = await page
        .getByRole("button", { name: "Back to Review" })
        .boundingBox();
      const matchupBox = await matchup.boundingBox();
      const boardBox = await reviewBoard.boundingBox();
      expect(
        backBox &&
          matchupBox &&
          backBox.x + backBox.width <= matchupBox.x &&
          backBox.y < matchupBox.y + matchupBox.height &&
          matchupBox.y < backBox.y + backBox.height,
      ).toBe(true);
      expect(
        matchupBox &&
          boardBox &&
          matchupBox.y + matchupBox.height <= boardBox.y,
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath("matchup-" + String(width) + ".png"),
      });
    }
    await page.getByRole("button", { name: "Back to Review" }).click();
    await expect(rows).toHaveCount(3);
  } finally {
    await context.close();
  }
});
