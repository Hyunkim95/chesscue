import { expect, test } from "@playwright/test";

// While Rook checks a move, nothing else can start: the chips are dimmed
// and ignore taps until the answer is in (owner request, 28 November 2026).

test("Rook's chips cannot be tapped while a typed question is answered", async ({
  page,
}) => {
  // The question router's answer is held back, so the wait is visible.
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*:generateContent*", async (route) => {
    await held;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: JSON.stringify({ intent: "threats" }) }],
            },
            finishReason: "STOP",
          },
        ],
      }),
    });
  });
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  const chips = page
    .getByRole("group", { name: "Ask Rook" })
    .getByRole("button");
  await expect(chips.first()).toBeVisible();
  const before = await page.locator(".rook-bubble__text").textContent();
  const ask = page.getByRole("textbox", { name: "Ask Rook" });
  await ask.fill("is anything of mine in danger here");
  await ask.press("Enter");
  await expect(page.locator(".rook-bubble__text")).toHaveText("Let me think…");
  for (const chip of await chips.all()) {
    await expect(chip).toHaveAttribute("aria-disabled", "true");
    await chip.click({ force: true });
  }
  // Taps while busy did nothing.
  await expect(page.locator(".rook-bubble__text")).toHaveText("Let me think…");
  release();
  await expect(page.locator(".rook-bubble__text")).not.toHaveText(
    "Let me think…",
    { timeout: 15_000 },
  );
  expect(await page.locator(".rook-bubble__text").textContent()).not.toBe(
    before,
  );
  for (const chip of await chips.all())
    await expect(chip).not.toHaveAttribute("aria-disabled");
});
