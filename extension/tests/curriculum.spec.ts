import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("opens the full installed curriculum and solves a position offline in the side panel", async () => {
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
    const page = context.pages()[0] ?? (await context.newPage());
    await context.setOffline(true);
    await page.goto("chrome-extension://" + id + "/index.html?panel=1");
    await page.getByRole("button", { name: "Practice", exact: true }).click();

    const stages = page.getByRole("group", { name: "Curriculum stages" });
    await expect(
      page.getByRole("heading", { name: "Skill tree", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".practice-tree__evidence")).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Chess skills" }),
    ).toBeHidden();
    for (const [title, count] of [
      ["Play safely", 5],
      ["Create and answer threats", 6],
      ["Calculate and convert", 5],
      ["Make a plan", 5],
    ] as const) {
      const units = page.getByRole("list", { name: title + " units" });
      await stages.getByRole("combobox").selectOption({ label: title });
      await expect(units.getByRole("listitem")).toHaveCount(count);
    }
    await stages.getByRole("combobox").selectOption({ label: "Play safely" });
    await page.getByText("Read the board", { exact: true }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: test.info().outputPath("curriculum-320.png"),
    });
    await page.getByRole("button", { name: "Exercise 1", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Find the first move" }),
    ).toBeVisible();

    for (const width of [320, 420]) {
      await page.setViewportSize({ width, height: 760 });
      await expect(
        page.getByRole("grid", { name: "Training board, White side" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: test.info().outputPath("exercise-" + String(width) + ".png"),
      });
    }
    await page.reload();
    await page.getByRole("gridcell", { name: /White king on e1/ }).click();
    await page
      .getByRole("gridcell", { name: /Empty g1, legal destination/ })
      .click();
    await expect(page.getByText("Good move", { exact: true })).toBeVisible();
    await page.getByText("Sources", { exact: true }).click();
    await expect(page.getByText(/OpenAI GPT-6.2 Sol/)).toBeVisible();
  } finally {
    await context.close();
  }
});

test("highlights a curriculum unit from a verified miss in an imported game", async () => {
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
    const page = context.pages()[0] ?? (await context.newPage());
    await context.setOffline(true);
    await page.goto("chrome-extension://" + id + "/index.html?panel=1#import");
    await page
      .getByLabel("Paste completed PGN games")
      .fill('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
    await page.getByRole("radio", { name: "I played White" }).check();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    await expect(page).toHaveURL(/#review\//);
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    const next = page.getByRole("button", {
      name: "See the opponent’s next threat, recommended from your games",
    });
    await expect(next).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".practice-tree__evidence")).toContainText("g4");
    await expect(
      page.getByRole("button", { name: "Exercise 1", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await page.screenshot({
      path: test.info().outputPath("recommended-320.png"),
    });
    await page.setViewportSize({ width: 420, height: 760 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(420);
    await expect(next).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("recommended-420.png"),
    });
  } finally {
    await context.close();
  }
});
