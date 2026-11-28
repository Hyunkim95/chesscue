import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

// The next-move tool in the side panel: reached from Play, searched by the
// local Stockfish with no network, and laid out without sideways scrolling.
for (const width of [320, 420]) {
  test(`finds the next move offline in a ${String(width)} px side panel`, async () => {
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
      await page.goto(
        "chrome-extension://" + id + "/index.html?panel=1#play-mode",
      );
      await context.setOffline(true);

      await page.getByRole("button", { name: "Next move" }).click();
      await expect(page.getByText("Depth 18", { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.getByRole("region", { name: "Best move" }),
      ).toContainText(/BEST MOVE\S+[+−]?\d\.\d/);

      await page
        .locator('[role=gridcell][aria-label^="White knight on g1"]')
        .click();
      await page.locator('[role=gridcell][aria-label^="Empty f3"]').click();
      await expect(page.getByText(/^Nf3 .*, (and|but) I /)).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        page.getByRole("button", { name: "Set position" }),
      ).toBeInViewport();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      ).toBeLessThanOrEqual(0);
      await page.screenshot({
        path: `test-results/next-move-panel-${String(width)}.png`,
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  });
}
