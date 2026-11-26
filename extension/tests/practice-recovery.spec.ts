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
      urls: ["*SharedPuzzleLibrary-*.js"],
    });
    await page.goto("chrome-extension://" + id + "/index.html?panel=1");
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    const notice = page.getByRole("alert").filter({
      hasText: "Shared puzzle library could not load.",
    });
    await expect(notice).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Curriculum stages" }),
    ).toBeVisible();
    await page.getByText("Read the board", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Exercise 1", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    await network.send("Network.setBlockedURLs", { urls: [] });
    await context.setOffline(true);
    await notice.getByRole("button", { name: "Reload Practice" }).click();
    await expect(
      page.getByText("Shared puzzle library", { exact: true }),
    ).toBeVisible();
    await expect(notice).toHaveCount(0);
  } finally {
    await context.close();
  }
});
