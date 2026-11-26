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
    await page.goto("chrome-extension://" + id + "/index.html?panel=1");
    const practice = page.getByRole("button", {
      name: "Practice",
      exact: true,
    });
    const queue = page.getByRole("region", {
      name: "Mistakes from PGN reviews",
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
    const debrief = page.getByRole("region", { name: "Game debrief" });
    await expect(debrief).toBeVisible({ timeout: 20000 });
    const reviewUrl = page.url();
    const explore = debrief.getByRole("button", {
      name: "Explore with Rook",
      exact: true,
    });
    const replay = debrief.getByRole("group", { name: "Replay controls" });
    const board = debrief.getByRole("grid", {
      name: "Review board, White side",
    });
    await expect(
      board.getByRole("gridcell", {
        name: /Black queen on d8.*Rook highlight/,
      }),
    ).toBeVisible();
    await expect(
      board.getByRole("gridcell", { name: /White king on e1.*Rook highlight/ }),
    ).toBeVisible();
    await debrief
      .getByRole("button", { name: "Show the reply", exact: true })
      .click();
    await expect(
      board.getByRole("gridcell", {
        name: /Black queen on h4.*last move ended here/,
      }),
    ).toBeVisible();
    await expect(
      debrief.getByText(/no legal way to save the king/),
    ).toBeVisible();
    await expect(debrief.getByRole("grid")).toHaveCount(1);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(board).toBeInViewport({ ratio: 1 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath("visual-debrief-" + String(width) + ".png"),
      });
    }
    await page.setViewportSize({ width: 320, height: 760 });
    await debrief
      .getByRole("button", { name: "Back to your move", exact: true })
      .click();
    await expect(
      board.getByRole("gridcell", { name: /Black queen on d8/ }),
    ).toBeVisible();
    await expect(page).toHaveURL(reviewUrl);
    await replay.getByRole("button", { name: "Next move" }).click();
    await explore.click();
    await expect(
      rook.getByRole("gridcell", { name: /Black queen on h4/ }),
    ).toBeVisible();
    await expect(
      rook.getByText("After 2... Qh4# · White’s position"),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("visual-debrief-rook-handoff.png"),
    });
    await page.getByRole("button", { name: "Back to game debrief" }).click();
    await expect(
      board.getByRole("gridcell", { name: /Black queen on h4/ }),
    ).toBeVisible();
    await practice.click();
    await expect(queue).toHaveCount(0);

    await page.goto(reviewUrl);
    await debrief
      .getByRole("button", { name: "Turning point", exact: true })
      .click();
    await replay.getByRole("button", { name: "Previous move" }).click();
    await explore.click();
    const meter = rook.getByRole("meter", { name: "Stockfish evaluation" });
    const white = meter.locator('[data-side="white"]');
    const black = meter.locator('[data-side="black"]');
    await expect(white).toBeVisible();
    await expect(black).toBeVisible();
    for (const attempt of [1, 2]) {
      await rook.getByRole("gridcell", { name: "White pawn on g2" }).click();
      await rook.getByRole("gridcell", { name: /Empty g4/ }).click();
      await expect(
        rook.getByRole("button", { name: "Show me", exact: true }),
      ).toBeEnabled();
      if (attempt === 1)
        await rook.getByRole("button", { name: "Rewind", exact: true }).click();
    }

    await expect(meter).toHaveAttribute("aria-valuetext", "Black mate");
    await expect(black).toBeVisible();
    const spans = await black.evaluate((segment) => ({
      segment: segment.getBoundingClientRect().width,
      track: segment.parentElement?.clientWidth ?? 0,
    }));
    expect(spans.segment).toBeGreaterThan(0);
    expect(spans.segment).toBeCloseTo(spans.track, 0);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(meter).toBeInViewport();
      await page.screenshot({
        path: test.info().outputPath("black-mate-" + String(width) + ".png"),
      });
    }

    await context.setOffline(true);
    await practice.click();
    const retry = queue.getByRole("button", { name: "Retry g4", exact: true });
    await expect(retry).toHaveCount(1);
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await retry.scrollIntoViewIfNeeded();
      await expect(retry).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test
          .info()
          .outputPath("review-practice-" + String(width) + ".png"),
      });
    }
    await retry.click();
    await expect(
      page.getByRole("heading", { name: "Retry move 2" }),
    ).toBeVisible();
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
