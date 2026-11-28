import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("shows player rank before sync in the side panel", async () => {
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
    const profile = page.getByRole("button", { name: "Account", exact: true });
    await expect(profile).toHaveText("");
    await expect(profile.locator("svg")).toBeVisible();
    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      const target = await profile.boundingBox();
      expect(target?.width).toBeGreaterThanOrEqual(44);
      expect(target?.height).toBeGreaterThanOrEqual(44);
    }
    await profile.focus();
    await profile.press("Enter");
    await expect(profile).toHaveAttribute("aria-current", "page");
    const account = page.getByRole("main");
    const sync = account.getByRole("button", { name: "Continue with Google" });
    const rank = account.getByRole("region", { name: "Your Elo" });
    await expect(sync).toBeVisible();
    await expect(rank).toBeVisible();
    await expect(
      account.getByRole("region", { name: "Your training profile" }),
    ).toHaveCount(0);

    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      const syncBox = await sync.boundingBox();
      const rankBox = await rank.boundingBox();
      if (!syncBox || !rankBox) throw new Error("Missing account controls.");
      expect(rankBox.y + rankBox.height).toBeLessThan(syncBox.y);
      await expect(
        rank.getByRole("heading", { name: "Unranked" }),
      ).toBeInViewport();
      await expect(rank.getByText("5 placement games left")).toBeInViewport();
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
