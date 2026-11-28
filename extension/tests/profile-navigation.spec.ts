import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("opens the same profile from Today and Games", async () => {
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
    await page.goto(`chrome-extension://${id}/index.html?panel=1`);
    await page.evaluate(() => {
      localStorage.setItem(
        "username-imports",
        JSON.stringify({
          chesscom: "AlexandraKonstantinopoulou92",
          lichess: "RapidPlayer",
        }),
      );
    });

    const profile = page.getByRole("button", {
      name: "Profile",
      exact: true,
    });
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const rankPath = page.getByRole("heading", { name: "Rank path" });
    const voice = page.getByRole("switch", { name: "Rook reads aloud" });
    const account = page.getByRole("button", { name: "Account settings" });

    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await nav.getByRole("button", { name: "Today" }).click();
      await profile.click();
      await expect(page).toHaveURL(/#profile$/);
      await expect(rankPath).toBeVisible();
      await expect(voice).toBeVisible();
      await expect(voice).toHaveAttribute(
        "aria-checked",
        String(width === 420),
      );
      if (width === 320) await voice.click();

      await nav.getByRole("button", { name: "Games" }).click();
      await expect(
        page.getByRole("heading", { name: "Your games" }),
      ).toBeVisible();
      await expect(nav.getByRole("button", { name: "Games" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      // Saved usernames are offered for a refresh, within reach.
      await expect(
        page.getByRole("button", { name: "Refresh Chess.com games" }),
      ).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        fullPage: true,
        path: test.info().outputPath(`games-empty-${String(width)}.png`),
      });
      await profile.click();
      await expect(page).toHaveURL(/#profile$/);
      await expect(rankPath).toBeVisible();
      await expect(voice).toHaveAttribute("aria-checked", "true");
      await expect(
        page.getByText("AlexandraKonstantinopoulou92", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("RapidPlayer", { exact: true }),
      ).toBeVisible();

      await expect(
        page.getByRole("button", { name: "Change Chess.com name" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        fullPage: true,
        path: test.info().outputPath(`profile-${String(width)}.png`),
      });
    }

    await account.click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Guest player" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Cross-device sync" }),
    ).toBeVisible();
    await profile.click();
    await expect(rankPath).toBeVisible();

    await nav.getByRole("button", { name: "Games" }).click();
    await page.getByRole("button", { name: "Import PGN" }).click();
    await page
      .getByLabel("Paste completed PGN games")
      .fill(
        [
          '[Event "Club"]\n[White "A_long_player_name_for_the_review_list"]\n[Black "Me"]\n[Date "2026.11.28"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
          '[Event "Club"]\n[White "Jules"]\n[Black "Me"]\n[Date "2026.11.27"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7# 1-0',
        ].join("\n\n"),
      );
    await page.getByRole("radio", { name: "I played Black" }).check();
    await page
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    await expect(
      page.getByText("2 accepted, 0 duplicate, 0 rejected"),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Games" }).click();
    await page.reload();

    const cards = page
      .getByRole("list", { name: "Completed games" })
      .getByRole("button");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveAccessibleName(/A_long_player_name.*Win/);
    await expect(cards.last()).toHaveAccessibleName(/Jules.*Loss/);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(cards.last()).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath(`games-saved-${String(width)}.png`),
      });
    }
    await cards.first().press("Enter");
    await expect(page).toHaveURL(/#review\//);
    // The game plays as one replay that is also its report.
    await expect(
      page.getByRole("heading", { level: 1, name: /You beat A_long/ }),
    ).toBeVisible();
    const board = page.getByRole("grid", { name: /You beat A_long/ });
    await page
      .getByRole("button", { name: "Move 2: a chance you took" })
      .click({ timeout: 30_000 });
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(board).toBeInViewport();
      await expect(
        page.getByRole("group", { name: "This moment" }),
      ).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath(`watch-${String(width)}.png`),
        animations: "disabled",
      });
    }
    await page.setViewportSize({ width: 320, height: 760 });
    await page.getByRole("button", { name: "Keep watching" }).click();
    await page.getByRole("button", { name: "Watch again" }).click();
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Analyze this position" }).click();
    await expect(
      page.getByRole("grid", { name: "Next move board" }),
    ).toBeInViewport();
    await expect(page.getByRole("img", { name: /^Stockfish:/ })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("replay-next-move-320.png"),
    });
    await page.getByRole("button", { name: "Back to replay" }).click();
    await expect(
      page.getByRole("button", { name: "Analyze this position" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to Games" }).click();
    await expect(cards).toHaveCount(2);
  } finally {
    await context.close();
  }
});
