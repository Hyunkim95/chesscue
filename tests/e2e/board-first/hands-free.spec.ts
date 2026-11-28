import { expect, test } from "@playwright/test";

// Hands-free in a moment: Rook reads each line aloud, then listens; saying
// "next" steps through the answer and a spoken question gets an answer.

test.use({ viewport: { width: 320, height: 760 } });

test("hands-free reads Rook aloud and steps through the answer by voice", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const heard = ["", "Move.", "why Kh8"];
    const said: string[] = [];
    Object.assign(window, { rookSaid: said });
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
        setTimeout(() => {
          this.onstart?.();
          this.onaudiostart?.();
          const text = heard.shift() ?? "";
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
    const synth = window.speechSynthesis;
    synth.speak = (utterance: SpeechSynthesisUtterance) => {
      said.push(utterance.text);
      setTimeout(() => {
        utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
      }, 50);
    };
  });
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show me" }).click();
  const steps = page.getByRole("group", { name: "Step through the line" });
  await expect(steps).toContainText("Step 1 of 3");
  await page.getByRole("button", { name: "Hands-free voice" }).click();
  await expect(
    page.getByRole("button", { name: "Hands-free voice" }),
  ).toHaveAttribute("aria-pressed", "true");
  // The mic reopens after silence, then "Move" presses the next-step control.
  await expect(steps).toContainText("Step 2 of 3", { timeout: 10_000 });
  await expect(page.locator(".rook-bubble__text")).toHaveText(
    "Kh8 is my only legal move.",
    { timeout: 10_000 },
  );
  const said = await page.evaluate(
    () => (window as unknown as { rookSaid: string[] }).rookSaid,
  );
  expect(said[0]).toContain("Qxg5+");
  expect(said).toContain("I have to play Kh8.");
});

test("hands-free never hears Rook's own voice as a question", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // A real mic hears the speakers: whatever Rook says while a recognition
    // is open comes back as speech.
    const log = { said: [] as string[], echoed: [] as string[] };
    Object.assign(window, { rookLog: log });
    const mic: { open?: FakeRecognition | undefined } = {};
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
        mic.open = this;
        setTimeout(() => {
          this.onstart?.();
          this.onaudiostart?.();
        }, 20);
      }
      hear(text: string) {
        const result = Object.assign([{ transcript: text }], {
          isFinal: true,
        });
        this.onresult?.({ results: [result] });
        if (mic.open === this) mic.open = undefined;
        this.onend?.();
      }
      stop() {
        if (mic.open === this) mic.open = undefined;
        this.onend?.();
      }
      abort() {
        if (mic.open === this) mic.open = undefined;
        this.onend?.();
      }
    }
    Object.assign(window, {
      SpeechRecognition: FakeRecognition,
      webkitSpeechRecognition: FakeRecognition,
    });
    window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
      log.said.push(utterance.text);
      const listener = mic.open;
      if (listener) {
        log.echoed.push(utterance.text);
        setTimeout(() => {
          listener.hear(utterance.text);
        }, 30);
      }
      setTimeout(() => {
        utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
      }, 80);
    };
  });
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show me" }).click();
  const steps = page.getByRole("group", { name: "Step through the line" });
  await page.getByRole("button", { name: "Hands-free voice" }).click();
  // Rook reads step 1, then listens. A tap moves on while the mic is open.
  await expect(page.getByText("Listening", { exact: false })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(steps).toContainText("Step 2 of 3");
  const bubble = page.locator(".rook-bubble__text");
  await expect(bubble).toHaveText("I have to play Kh8.");
  // Rook stops listening before he speaks, so he never answers himself.
  await page.waitForTimeout(600);
  await expect(bubble).toHaveText("I have to play Kh8.");
  const log = await page.evaluate(
    () =>
      (window as unknown as { rookLog: { said: string[]; echoed: string[] } })
        .rookLog,
  );
  expect(log.said).toContain("I have to play Kh8.");
  expect(log.echoed).toEqual([]);
});
