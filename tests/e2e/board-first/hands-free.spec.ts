import { expect, test } from "@playwright/test";

// Hands-free in a moment: Rook reads each line aloud, then listens; saying
// "next" steps through the answer and a spoken question gets an answer.

test.use({ viewport: { width: 320, height: 760 } });

test("hands-free reads Rook aloud and steps through the answer by voice", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const heard = ["next", "why Kh8"];
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
  // Rook reads step 1, listens, hears "next", reads step 2, hears a question.
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
