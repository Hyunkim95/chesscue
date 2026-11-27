import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("pins Ask Rook while scrolling and opens microphone setup from the panel", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    viewport: { width: 320, height: 640 },
    args: [
      "--enable-unsafe-extension-debugging",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  try {
    const browser = context.browser();
    if (!browser) throw new Error("No extension-capable Chrome connection.");
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: resolve("extension/dist"),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8_000);
    await page.addInitScript(() => {
      class TestSpeechRecognition {
        static available() {
          return Promise.resolve("available");
        }
        processLocally = false;
      }
      const queryPermission = navigator.permissions.query.bind(
        navigator.permissions,
      );
      Object.defineProperty(navigator.permissions, "query", {
        value: (descriptor: PermissionDescriptor) =>
          descriptor.name === "microphone"
            ? Promise.resolve({ state: "prompt" })
            : queryPermission(descriptor),
      });
      Object.defineProperty(window, "SpeechRecognition", {
        value: TestSpeechRecognition,
        configurable: true,
      });
    });
    await page.goto(
      "chrome-extension://" + id + "/index.html?panel=1#play-mode",
    );
    await page.getByRole("button", { name: "Coached", exact: true }).click();
    const composer = page.getByRole("textbox", { name: "Message Rook" });
    await expect(composer).toBeInViewport({ ratio: 1 });
    const composerBounds = await composer.boundingBox();

    const details = page.getByText("Game details", { exact: true });
    await details.evaluate((element) => {
      element.scrollIntoView({ block: "center" });
    });
    await details.click();
    const resign = page.getByRole("button", { name: "Resign game" });
    await resign.evaluate((element) => {
      element.scrollIntoView({ block: "center" });
    });
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    expect(await composer.boundingBox()).toEqual(composerBounds);

    await page
      .getByRole("button", { name: "Talk to Rook", exact: true })
      .click();
    const launch = page.getByRole("link", { name: "Allow microphone" });
    await expect(launch).toBeInViewport({ ratio: 1 });
    expect(await composer.boundingBox()).toEqual(composerBounds);
    const [setup] = await Promise.all([
      context.waitForEvent("page", { timeout: 8_000 }),
      launch.click(),
    ]);
    setup.setDefaultTimeout(8_000);
    await setup.getByRole("button", { name: "Allow microphone" }).click();
    await expect(setup.getByRole("status")).toContainText("Microphone allowed");
  } finally {
    await context.close();
  }
});

test("passes a live microphone track to Rook and releases it after dictation", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    viewport: { width: 320, height: 760 },
    args: [
      "--enable-unsafe-extension-debugging",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  try {
    const browser = context.browser();
    if (!browser) throw new Error("No extension-capable Chrome connection.");
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: resolve("extension/dist"),
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      class TestSpeechRecognition {
        static available() {
          return Promise.resolve("available");
        }
        processLocally = false;
        onstart: (() => void) | null = null;
        onaudiostart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onresult:
          | ((event: {
              results: ArrayLike<{
                isFinal: boolean;
                0: { transcript: string };
              }>;
            }) => void)
          | null = null;
        start(track?: MediaStreamTrack) {
          this.onstart?.();
          document.documentElement.dataset.capture =
            track?.readyState ?? "missing";
          if (track?.kind !== "audio" || track.readyState !== "live") return;
          const stop = track.stop.bind(track);
          Object.defineProperty(track, "stop", {
            value: () => {
              stop();
              document.documentElement.dataset.capture = track.readyState;
            },
          });
          document.addEventListener(
            "rook-test-audio",
            () => {
              this.onaudiostart?.();
            },
            { once: true },
          );
        }
        stop() {
          this.onresult?.({
            results: [
              { 0: { transcript: "What should I watch for?" }, isFinal: true },
            ],
          });
          this.onend?.();
        }
        abort() {
          this.onend?.();
        }
      }
      Object.defineProperty(navigator.permissions, "query", {
        value: () => Promise.resolve({ state: "granted" }),
      });
      Object.defineProperty(window, "SpeechRecognition", {
        value: TestSpeechRecognition,
        configurable: true,
      });
    });
    await page.goto(
      "chrome-extension://" + id + "/index.html?panel=1#play-mode",
    );
    await page.getByRole("button", { name: "Coached", exact: true }).click();
    await page
      .getByRole("button", { name: "Talk to Rook", exact: true })
      .click();

    const documentRoot = page.locator("html");
    await expect(documentRoot).toHaveAttribute("data-capture", "live");
    await expect(page.getByText("Opening microphone…")).toBeInViewport();
    await expect(page.getByText("Listening…")).toHaveCount(0);
    await page.evaluate(() => {
      globalThis.document.dispatchEvent(new Event("rook-test-audio"));
    });
    await expect(page.getByText("Listening…")).toBeInViewport();
    await page
      .getByRole("button", { name: "Finish speaking", exact: true })
      .click();
    await expect(page.getByRole("log")).toContainText(
      "What should I watch for?",
    );
    await expect(documentRoot).toHaveAttribute("data-capture", "ended");
    await page
      .getByRole("button", { name: "Talk to Rook", exact: true })
      .click();
    await expect(documentRoot).toHaveAttribute("data-capture", "live");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(documentRoot).toHaveAttribute("data-capture", "ended");
  } finally {
    await context.close();
  }
});
