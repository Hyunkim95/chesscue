import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("keeps Practice usable when a puzzle library file cannot load", async () => {
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
    const network = await context.newCDPSession(page);
    await network.send("Network.enable");
    await network.send("Network.setBlockedURLs", {
      urls: ["*puzzle-catalog-*.js"],
    });
    await page.goto(
      "chrome-extension://" + id + "/index.html?panel=1&ui=classic",
    );
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    const attack = page.getByRole("button", {
      name: "Attack two targets",
      exact: true,
    });
    await attack.click();
    await expect(
      page.getByRole("button", { name: "Back to Practice" }),
    ).toBeVisible();
    const fallbackPuzzle = page.url();
    await page.getByRole("button", { name: "Back to Practice" }).click();
    await expect(attack).toBeFocused();
    await network.send("Network.setBlockedURLs", { urls: [] });
    await context.setOffline(true);
    await page.reload();
    await attack.click();
    await expect(
      page.getByRole("gridcell", { name: /White knight on g4/ }),
    ).toBeVisible();
    expect(page.url()).not.toBe(fallbackPuzzle);
  } finally {
    await context.close();
  }
});
