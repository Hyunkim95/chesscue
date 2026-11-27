import { expect, test, type Page } from "@playwright/test";

// Motion never blocks input, and players who ask for less motion get none.

test.use({ viewport: { width: 360, height: 800 } });

async function openToday(page: Page) {
  await page.goto("/?ui=board-first");
  await expect(
    page.getByRole("heading", { name: "Warm-up position" }),
  ).toBeVisible({ timeout: 20_000 });
}

test("a tap lands on the new screen while the tab is still fading in", async ({
  page,
}) => {
  await openToday(page);
  const box = await page
    .getByRole("button", { name: "Try the warm-up" })
    .boundingBox();
  if (!box) throw new Error("Try the warm-up has no box");
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Sky" }).click();
  await expect(page.getByRole("heading", { name: "Your sky" })).toBeVisible();

  // Slow every animation 20 times so the tap lands mid-fade however long
  // the click takes on a loaded machine.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.05 });
  await nav.getByRole("button", { name: "Today" }).click();
  // Straight away, with no waiting for the fade: a raw tap at the button.
  const opacity = await page
    .locator(".app-shell__body")
    .evaluate((body) => Number(getComputedStyle(body).opacity));
  expect(opacity).toBeLessThan(1);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a tab switches at once, without a fade", async ({ page }) => {
    await openToday(page);
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Sky" })
      .click();
    const opacity = await page
      .locator(".app-shell__body")
      .evaluate((body) => Number(getComputedStyle(body).opacity));
    expect(opacity).toBe(1);
  });
});
