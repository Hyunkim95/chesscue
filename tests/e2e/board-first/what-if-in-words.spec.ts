import { expect, test } from "@playwright/test";

// A "what if" in the player's own words is played out at once (owner, 28
// November 2026): no "play it on the board" step, a preview only, never a
// try. Offline, with no language model, so code alone reads the move.

test.use({ viewport: { width: 320, height: 760 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "LanguageModel", {
      configurable: true,
      value: undefined,
    });
  });
});

test("a typed what-if while solving plays out at once", async ({
  page,
  context,
}) => {
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  // Offline once the app is installed: its files are cached and served.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  const ask = page.getByRole("textbox", { name: "Ask Rook" });
  await ask.fill("what if my queen goes to h5");
  await ask.press("Enter");
  await expect(page.getByText("Preview · not played")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("gridcell", { name: /^White queen on h5/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Play it on the board" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Your tries")).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("what-if-typed-320.png"),
  });

  // Words that fit two moves: both drawn, then the one picked plays out.
  await page.getByRole("button", { name: /Reset/ }).click();
  await ask.fill("what if the rook goes to d1");
  await ask.press("Enter");
  await expect(page.locator(".rook-bubble__text")).toContainText(
    "Which one: Rad1 or Rfd1?",
  );
  await page.getByRole("button", { name: "What if Rfd1?" }).click();
  await expect(page.getByText("Preview · not played")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("gridcell", { name: /^White rook on d1/ }),
  ).toBeVisible();
});

test("a spoken what-if in hands-free plays out at once", async ({ page }) => {
  await page.addInitScript(() => {
    const heard = ["what if queen h5"];
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      processLocally = true;
      onstart: (() => void) | null = null;
      onaudiostart: (() => void) | null = null;
      onresult: ((event: { results: unknown }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      static available() {
        return Promise.resolve("available");
      }
      start() {
        const text = heard.shift();
        setTimeout(() => {
          this.onstart?.();
          this.onaudiostart?.();
          if (text === undefined) return;
          const result = Object.assign([{ transcript: text }], {
            isFinal: true,
          });
          this.onresult?.({ results: [result] });
          this.onend?.();
        }, 50);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    Object.assign(window, {
      SpeechRecognition: FakeRecognition,
      webkitSpeechRecognition: FakeRecognition,
    });
    window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
      setTimeout(() => {
        utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
      }, 50);
    };
  });
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Hands-free voice" }).click();
  await expect(page.getByText("Preview · not played")).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("gridcell", { name: /^White queen on h5/ }),
  ).toBeVisible();
  await expect(page.getByLabel("Your tries")).toHaveCount(0);
});
