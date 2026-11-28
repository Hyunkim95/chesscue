import { expect, test, type Page, type Route } from "@playwright/test";

// SLO-014: a wait longer than 200 ms always shows the shape of what is
// coming, never a blank or unchanged screen.

test.use({ viewport: { width: 320, height: 760 } });

function holdUntilReleased(page: Page, pattern: string) {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  void page.route(pattern, async (route: Route) => {
    await held;
    await route.continue();
  });
  return () => {
    release();
  };
}

test("cold open paints a skeleton before the application script runs", async ({
  page,
}) => {
  const release = holdUntilReleased(page, "**/assets/index-*.js");
  const started = Date.now();
  await page.goto("/?ui=board-first", { waitUntil: "commit" });
  try {
    const skeleton = page.locator(".launch-state");
    await expect(skeleton).toBeVisible({ timeout: 500 });
    expect(Date.now() - started).toBeLessThan(1_500);
    await expect(skeleton.locator(".launch-state__board")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Opening ChessCue…");
  } finally {
    release();
  }
  await expect(page.locator(".launch-state")).toHaveCount(0);
});

test("a screen whose code is still loading shows a skeleton", async ({
  page,
}) => {
  const release = holdUntilReleased(page, "**/assets/RaceView-*.js");
  await page.goto("/?ui=classic#races");
  try {
    const waiting = page.getByRole("status").filter({
      hasText: "Loading race…",
    });
    await expect(waiting).toBeVisible();
    await expect(waiting.locator(".skeleton").first()).toBeVisible({
      timeout: 300,
    });
    // The words are for screen readers; the shape is what players see.
    await expect(waiting.locator(".ui-visually-hidden")).toHaveText(
      "Loading race…",
    );
  } finally {
    release();
  }
  await expect(
    page.getByRole("status").filter({ hasText: "Loading race…" }),
  ).toHaveCount(0);
});
