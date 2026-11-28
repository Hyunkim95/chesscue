import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

const sidebarResult =
  '<div class="result-row"><span class="game-result">0-1</span></div><div class="game-review-buttons-component"><a href="/analysis/game/live/171700487346?tab=review">Game Review</a></div>';

for (const [source, width] of [
  ["finished play", 320],
  ["game link", 420],
  ["analysis", 420],
] as const) {
  test(`reviews a completed Chess.com game from ${source} at ${String(width)} px`, async () => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      viewport: { width, height: 760 },
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
      const site = "https://www.chess.com/game/live/171700487346";
      const chessPage = {
        analysis:
          "https://www.chess.com/analysis/game/live/171700487346/analysis",
        "game link": "https://www.chess.com/game/171700487346",
        "finished play": "https://www.chess.com/play/online",
      }[source];
      const archive = "https://api.chess.com/pub/player/mira/games/2026/07";
      let reloadedWithResult = false;
      await context.route(chessPage, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<div class="board-layout-sidebar"><div data-test-element="user-tagline-username">Mira</div><div id="result">${
            reloadedWithResult ? sidebarResult : ""
          }</div></div>`,
        }),
      );
      let archiveRequests = 0;
      await context.route(
        "https://api.chess.com/pub/player/mira/games/archives",
        (route) => {
          archiveRequests++;
          return route.fulfill({ json: { archives: [archive] } });
        },
      );
      await context.route(archive, (route) =>
        route.fulfill({
          json: {
            games: [
              {
                url: site,
                rules: "chess",
                end_time: 1784294200,
                white: { username: "Mira", result: "checkmated" },
                black: { username: "Sam", result: "win" },
                pgn: '[White "Mira"]\n[Black "Sam"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
              },
            ],
          },
        }),
      );
      const page = await context.newPage();
      await page.goto(chessPage);
      const explore = page.getByRole("button", { name: "Explore with Rook" });
      await expect(explore).toHaveCount(0);
      const result = {
        analysis:
          '<div class="main-line-row move-list-row result-row"><span class="game-result">0-1 </span></div>',
        "game link": sidebarResult,
        "finished play":
          '<div class="game-over-modal-header-component game-over-modal-header-blackWon"><div class="game-over-modal-title-component">Black Won</div></div><div class="game-over-modal-shell-buttons"><a href="/analysis/game/live/171700487346">Review game</a></div>',
      }[source];
      await page.locator("#result").evaluate((element, result) => {
        element.innerHTML = result;
      }, result);
      await expect(explore).toBeVisible({ timeout: 4000 });
      if (source !== "analysis") {
        reloadedWithResult = true;
        await page.reload();
        await expect(explore).toBeVisible({ timeout: 4000 });
      }
      expect(archiveRequests).toBe(0);
      await explore.click();

      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      const panelPath = "index.html?panel=1#chesscom/live/171700487346/mira";
      await expect
        .poll(() =>
          worker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({
              active: true,
              lastFocusedWindow: true,
            });
            return tab?.id === undefined
              ? null
              : (await chrome.sidePanel.getOptions({ tabId: tab.id })).path;
          }),
        )
        .toBe(panelPath);
      const panel = await context.newPage();
      await panel.goto("chrome-extension://" + id + "/" + panelPath);
      await expect(
        panel.getByRole("heading", { name: "Which side did you play?" }),
      ).toBeVisible();
      await panel.screenshot({
        path: test.info().outputPath("choose-side.png"),
      });
      await panel.getByRole("button", { name: "White · Mira" }).click();
      await expect(panel).toHaveURL(/#review\//);
      await expect(
        panel.getByRole("textbox", { name: "Ask Rook" }),
      ).toBeVisible();
      await expect(
        panel.getByRole("heading", { name: /White to move/ }),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Full replay" }),
      ).toBeVisible();
      await panel.screenshot({
        path: test.info().outputPath("review-moment.png"),
      });
      expect(
        await panel.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (source === "finished play") {
        await page.locator("#result").evaluate((element) => {
          element.replaceChildren();
        });
        await expect(explore).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });
}
