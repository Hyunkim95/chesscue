import { expect, test } from "@playwright/test";

// Puzzles for you under Today's position (owner approval, 28 November
// 2026): three thumbnails, easiest first, each opening its puzzle. They
// work offline, since the pack is installed.

for (const width of [320, 420, 1280])
  test(`Today recommends three puzzles and opens one, at ${String(width)} px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 860 });
    await page.goto("/?ui=board-first");
    const strip = page.getByRole("region", { name: "Puzzles for you" });
    const puzzles = strip.getByRole("button", { name: /^Puzzle rated \d+/ });
    await expect(puzzles).toHaveCount(3, { timeout: 30_000 });
    const ratings = (await puzzles.allTextContents()).map(Number);
    expect(ratings).toEqual(ratings.toSorted((a, b) => a - b));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const navigation = page.getByRole("navigation", {
      name: "Primary navigation",
    });
    await expect
      .poll(async () => {
        const [tabs, last] = await Promise.all([
          navigation.boundingBox(),
          puzzles.last().boundingBox(),
        ]);
        if (!tabs || !last) return false;
        return tabs.x + tabs.width <= last.x || last.y + last.height <= tabs.y;
      })
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`today-puzzles-${String(width)}.png`),
    });
    await context.setOffline(true);
    await puzzles.first().click();
    await expect(page.getByRole("heading", { name: /to move/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/#moment\/puzzle%3A/);
  });
