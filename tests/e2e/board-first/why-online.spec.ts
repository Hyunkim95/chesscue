import { expect, test, type Route } from "@playwright/test";

// Online, "Why does it work?" opens on the point with the writer's checked
// words. Gemini is answered here, so the test checks what the app sends and
// what it shows, never the model.

const WHY =
  "Qxg5+ is the strongest move here, because every reply runs into checkmate.";

function gemini(text: string) {
  return async (route: Route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            content: { role: "model", parts: [{ text }] },
            finishReason: "STOP",
          },
        ],
      }),
    });
  };
}

for (const width of [320, 420])
  test(`online, Why does it work? says the checked why on the point, at ${String(width)} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const sent: string[] = [];
    await page.route("**/*:generateContent*", async (route) => {
      const body = route.request().postData() ?? "";
      if (!body.includes("bestMoveCaptures")) {
        await route.abort();
        return;
      }
      sent.push(body);
      await gemini(JSON.stringify({ why: WHY }))(route);
    });
    await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
    await expect(
      page.getByRole("heading", { name: /White to move/ }),
    ).toBeVisible({ timeout: 30_000 });
    const bubble = page.locator(".rook-bubble__text");
    await page.getByRole("button", { name: "Show me" }).click();
    // The answer opens on its first step; the checked why replaces only
    // that caption, and the board keeps the frame.
    await expect(bubble).toHaveText(WHY, { timeout: 30_000 });
    await expect(
      page.getByRole("group", { name: "Step through the line" }),
    ).toContainText("1 /");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('\\"bestMove\\":\\"Qxg5+\\"');
    await page.getByRole("button", { name: "Next step" }).click();
    await expect(bubble).not.toHaveText(WHY);
    await page.getByRole("button", { name: "Previous step" }).click();
    await expect(bubble).toHaveText(WHY);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    // Let the bubble's fade-in finish before the picture.
    await page.waitForTimeout(1_000);
    await page.screenshot({
      path: test.info().outputPath(`why-online-${String(width)}.png`),
    });
  });

test("a why that fails the check keeps the code caption", async ({ page }) => {
  let asked = 0;
  await page.route("**/*:generateContent*", async (route) => {
    if (!(route.request().postData() ?? "").includes("bestMoveCaptures")) {
      await route.abort();
      return;
    }
    asked += 1;
    // A count the packet never gave.
    await gemini(JSON.stringify({ why: "Qxg5+ leaves you 12 points ahead." }))(
      route,
    );
  });
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  const bubble = page.locator(".rook-bubble__text");
  await page.getByRole("button", { name: "Show me" }).click();
  await expect.poll(() => asked, { timeout: 30_000 }).toBe(1);
  await page.waitForTimeout(500);
  await expect(bubble).toContainText(/^Qxg5\+/);
  await expect(bubble).not.toContainText("12 points");
});
