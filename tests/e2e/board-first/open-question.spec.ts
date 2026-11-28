import { expect, test, type Route } from "@playwright/test";

// An open question while solving (owner decision, 28 November 2026): with
// the player's own key, Gemini Flash answers from checked board facts that
// never name the answer; without a key Rook keeps his own answer. Gemini is
// answered here, so the test checks what the app sends and shows.
const KEY = "AIza" + "open".repeat(8) + "abc";
const ANSWER =
  "Nothing of yours is in danger yet, so look at every check, capture and threat you have before choosing.";

async function gemini(route: Route) {
  const body = route.request().postData() ?? "";
  const reply = body.includes("asks an open question")
    ? { answer: ANSWER }
    : { intent: "other" };
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }],
    }),
  });
}

for (const width of [320, 420])
  test(`with a key, an open question while solving is answered from the board at ${String(width)} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript((key) => {
      localStorage.setItem("gemini-api-key", key);
    }, KEY);
    const sent: string[] = [];
    await page.route("**/*:generateContent*", async (route) => {
      sent.push(route.request().postData() ?? "");
      await gemini(route);
    });
    await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
    await expect(
      page.getByRole("heading", { name: /White to move/ }),
    ).toBeVisible({ timeout: 30_000 });
    const ask = page.getByRole("textbox", { name: "Ask Rook" });
    await ask.fill("What's going on here?");
    await ask.press("Enter");
    const bubble = page.locator(".rook-bubble__text");
    await expect(bubble).toHaveText(ANSWER, { timeout: 30_000 });
    await expect(
      page.getByText(/Gemini Flash · checked against the board/),
    ).toBeVisible();
    // The answer's request never carries the solution.
    const open = sent.find((body) => body.includes("asks an open question"));
    expect(open).toBeDefined();
    expect(open).not.toContain("Qxg5");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: test.info().outputPath(`open-question-${String(width)}.png`),
    });
  });

test("without a key, Rook keeps his own answer and asks Google nothing", async ({
  page,
}) => {
  let asked = 0;
  await page.route("**/*:generateContent*", async (route) => {
    asked += 1;
    await route.abort();
  });
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  const ask = page.getByRole("textbox", { name: "Ask Rook" });
  await ask.fill("What's going on here?");
  await ask.press("Enter");
  await expect(page.locator(".rook-bubble__text")).not.toHaveText(ANSWER);
  await page.waitForTimeout(1_500);
  expect(asked).toBe(0);
});
