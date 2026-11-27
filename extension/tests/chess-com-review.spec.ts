import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("reviews a completed Chess.com game without exporting a file", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
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
    const livePage = "https://www.chess.com/play/online";
    const archive = "https://api.chess.com/pub/player/mira/games/2026/07";
    await context.route(livePage, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<div class="board-layout-sidebar"><div data-test-element="user-tagline-username">Mira</div><div id="result"></div></div>',
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
    await page.goto(livePage);
    const explore = page.getByRole("button", { name: "Explore with Rook" });
    await expect(explore).toHaveCount(0);
    await page.locator("#result").evaluate((element) => {
      element.innerHTML =
        '<div class="game-over-modal-header-component game-over-modal-header-blackWon"><div class="game-over-modal-title-component">Black Won</div></div><div class="game-over-modal-shell-buttons"><a href="/analysis/game/live/171700487346">Review game</a></div>';
    });
    await expect(explore).toBeVisible({ timeout: 4000 });
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
    await panel.getByRole("button", { name: "White · Mira" }).click();
    await expect(panel).toHaveURL(/#review\//);
    await expect(
      panel.getByRole("textbox", { name: "Ask Rook" }),
    ).toBeVisible();
    await page.locator("#result").evaluate((element) => {
      element.replaceChildren();
    });
    await expect(explore).toHaveCount(0);
  } finally {
    await context.close();
  }
});
