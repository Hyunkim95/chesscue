import { chromium, expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

// The side panel opens on the board-first loop by default and plays it
// offline at the narrowest and a wider panel width.
async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

for (const width of [320, 420]) {
  test(`plays the warm-up offline in a ${String(width)} px side panel`, async () => {
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
      const page = await context.newPage();
      await page.goto("chrome-extension://" + id + "/index.html?panel=1");
      await context.setOffline(true);

      await expect(
        page.getByRole("heading", { name: "Warm-up position" }),
      ).toBeVisible({ timeout: 20_000 });
      const nav = page.getByRole("navigation", { name: "Primary navigation" });
      await expect(nav).toBeVisible();
      await noSideScroll(page);

      await page.getByRole("button", { name: "Try the warm-up" }).click();
      await expect(
        page.getByRole("heading", { name: /White to move/ }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("grid").first()).toBeInViewport({
        ratio: 1,
      });
      await noSideScroll(page);

      await page.getByRole("button", { name: "Show me" }).click();
      const ask = page.getByRole("textbox", { name: "Ask Rook" });
      await ask.fill("why would the queen take");
      await ask.press("Enter");
      await expect(page.locator(".rook-bubble__text")).toContainText(
        "Qxg5+ leads to mate.",
      );
      await expect(page.getByText(/Did you mean/)).toHaveCount(0);
      await expect(
        page.getByRole("textbox", { name: "Ask Rook" }),
      ).toBeVisible();
      // The answer waits for the player to step through it.
      const stepper = page.getByRole("group", {
        name: "Step through the line",
      });
      await expect(stepper).toContainText("Step 1 of 3");
      await page.getByRole("button", { name: "Next step" }).click();
      await expect(stepper).toContainText("Step 2 of 3");
      await noSideScroll(page);
      await page.screenshot({
        path: `test-results/extension-stepper-${String(width)}.png`,
      });
      await page
        .getByRole("button", { name: "Done ✓" })
        .click({ timeout: 20_000 });
      const sheet = page.getByRole("dialog", { name: "Not this time" });
      await expect(sheet).toBeVisible({ timeout: 20_000 });
      await expect(sheet).toBeInViewport({ ratio: 1 });
      await sheet.getByRole("button", { name: "Continue" }).click();

      await expect(
        page.getByRole("heading", { name: "From your games today" }),
      ).toBeVisible();
      await page.getByRole("button", { name: /See your sky/ }).click();
      await expect(
        page.getByRole("heading", { name: "Your sky" }),
      ).toBeVisible();
      await noSideScroll(page);

      const star = page
        .getByRole("group", { name: "Curriculum star chart" })
        .getByRole("button")
        .first();
      await star.click();
      const details = page.getByRole("dialog");
      await expect(details).toBeVisible();
      await noSideScroll(page);
      await page.screenshot({
        path: test.info().outputPath(`sky-star-${String(width)}.png`),
      });
      await details.getByRole("button", { name: "Close" }).press("Escape");
      await expect(details).toHaveCount(0);
      await expect(star).toBeFocused();

      await nav.getByRole("button", { name: "Play" }).click();
      await expect(page).toHaveURL(/#play/);
      await noSideScroll(page);
      await nav.getByRole("button", { name: /^Today/ }).click();
      await expect(page).toHaveURL(/#today/);
      await expect(page.locator(".today")).toBeVisible();

      const puzzles = page
        .getByRole("region", { name: "Puzzles for you" })
        .getByRole("button", { name: /^Puzzle rated \d+/ });
      await expect(puzzles).toHaveCount(3);
      await puzzles.last().scrollIntoViewIfNeeded();
      await noSideScroll(page);
      await page.screenshot({
        path: test
          .info()
          .outputPath(`extension-today-puzzles-${String(width)}.png`),
      });
      await puzzles.first().click();
      await expect(page).toHaveURL(/#moment\/puzzle%3A/);
      await expect(page.getByRole("heading", { name: /to move/ })).toBeVisible({
        timeout: 30_000,
      });
      const puzzleUrl = page.url();
      await page.reload();
      await expect(page).toHaveURL(puzzleUrl);
      await expect(page.getByRole("heading", { name: /to move/ })).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await context.close();
    }
  });
}
