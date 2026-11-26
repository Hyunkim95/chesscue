import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("keeps the account action easy to reach in the side panel", async () => {
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
    await page.getByRole("button", { name: "Account", exact: true }).click();
    const account = page.getByRole("main");
    const sync = account.getByRole("button", { name: "Continue with Google" });
    const rank = account.getByRole("region", { name: "Your Elo" });
    await expect(sync).toBeVisible();
    await expect(rank).toBeVisible();

    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      const syncBox = await sync.boundingBox();
      const rankBox = await rank.boundingBox();
      if (!syncBox || !rankBox) throw new Error("Missing account controls.");
      expect(syncBox.y + syncBox.height).toBeLessThan(rankBox.y);
      expect(syncBox.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath("account-" + String(width) + ".png"),
        fullPage: true,
      });
    }

    await rank.getByRole("button", { name: "View rank path" }).click();
    await expect(
      page.getByRole("heading", { name: "The climb" }),
    ).toBeVisible();
    await page.goBack();
    await expect(sync).toBeVisible();
  } finally {
    await context.close();
  }
});
