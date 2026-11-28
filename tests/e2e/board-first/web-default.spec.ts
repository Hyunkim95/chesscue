import { expect, test } from "@playwright/test";

// On the web, a first visit opens the same board-first app as the extension
// side panel (owner decision, 28 November 2026).
test.use({ storageState: { cookies: [], origins: [] } });

for (const width of [1280, 768, 375])
  test(`a first web visit opens board-first Today at ${String(width)} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const tabs = page.getByRole("navigation", { name: /tabs|primary/i });
    await expect(tabs.getByRole("button", { name: "Today" })).toBeVisible({
      timeout: 30_000,
    });
    for (const name of ["Play", "Sky", "Games"])
      await expect(tabs.getByRole("button", { name })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: test.info().outputPath(`web-default-${String(width)}.png`),
      fullPage: true,
    });
  });
