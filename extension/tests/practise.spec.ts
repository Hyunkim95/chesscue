/// <reference types="chrome" />
import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

async function openPanel() {
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
    return {
      context,
      url: "chrome-extension://" + id + "/index.html?panel=1&ui=classic",
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

test("opens the finished game from Lichess, reuses its review and plays offline", async () => {
  const { context, url } = await openPanel();
  try {
    const page = await context.newPage();
    const site = "https://lichess.org/game/abcdef12";
    await context.route(site, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<button id="user_tag">Mira</button><div class="result-wrap"><p class="result">0-1</p></div>',
      }),
    );
    let status = "mate";
    await context.route(
      "https://lichess.org/game/export/abcdef12?**",
      (route) =>
        route.fulfill({
          json: {
            id: "abcdef12",
            variant: "standard",
            status,
            players: {
              white: { user: { id: "mira", name: "Mira" } },
              black: {},
            },
            pgn: '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
          },
        }),
    );
    await page.goto(site);
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await expect
      .poll(() =>
        worker.evaluate(
          async () =>
            (await chrome.sidePanel.getPanelBehavior()).openPanelOnActionClick,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Explore with Rook" }).click();
    const panelPath = url + "#lichess/abcdef12/mira";
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          const tabs = await chrome.tabs.query({
            url: "https://lichess.org/*",
          });
          const tabId = tabs[0]?.id;
          return tabId === undefined
            ? null
            : (await chrome.sidePanel.getOptions({ tabId })).path;
        }),
      )
      .toBe("index.html?panel=1#lichess/abcdef12/mira");
    expect(context.pages()).toHaveLength(2);
    await page.close();
    const review = await context.newPage();
    review.setDefaultTimeout(8_000);
    await review.addInitScript(() => {
      const queryPermission = navigator.permissions.query.bind(
        navigator.permissions,
      );
      Object.defineProperty(navigator.permissions, "query", {
        value: (descriptor: PermissionDescriptor) =>
          descriptor.name === "microphone"
            ? Promise.resolve({ state: "granted" })
            : queryPermission(descriptor),
      });
      class TestSpeechRecognition {
        static localReady = false;
        static available() {
          return Promise.resolve(
            this.localReady ? "available" : "downloadable",
          );
        }
        static install() {
          this.localReady = true;
          return new Promise<boolean>(() => {
            // Chrome can report the pack as available before install settles.
          });
        }
        processLocally = false;
        onaudiostart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onresult:
          | ((event: {
              results: { isFinal: boolean; 0: { transcript: string } }[];
            }) => void)
          | null = null;
        start(track?: MediaStreamTrack) {
          if (!this.processLocally || track?.readyState !== "live")
            throw new Error(
              "Expected on-device speech with an active microphone",
            );
          this.onaudiostart?.();
        }
        stop() {
          this.onresult?.({
            results: [
              {
                isFinal: true,
                0: { transcript: "I thought this would develop my bishop" },
              },
            ],
          });
          this.onend?.();
        }
        abort() {
          this.onend?.();
        }
      }
      Object.defineProperty(window, "SpeechRecognition", {
        value: TestSpeechRecognition,
        configurable: true,
      });
    });
    await review.goto(panelPath);
    await review.getByRole("button", { name: "Share game and review" }).click();
    await expect(review).toHaveURL(/#review\//, { timeout: 20000 });
    const saved = review.url();
    const rook = review.getByRole("region", { name: "Explore with Rook" });
    await expect(rook.getByLabel("Ask Rook")).toBeVisible({ timeout: 30000 });
    const reviewNavigation = review.getByRole("banner");
    const fullReplay = rook.getByText("Replay the full game", { exact: true });
    await expect(
      reviewNavigation.getByRole("button", { name: "Back to Review" }),
    ).toBeVisible();
    await expect(
      review.getByRole("navigation", { name: "Primary navigation" }),
    ).toBeHidden();
    const gPawn = rook.getByRole("gridcell", { name: /White pawn on g2/ });
    const g4 = rook.getByRole("gridcell", { name: /Empty g4/ });
    const queen = rook.getByRole("gridcell", { name: /Black queen on d8/ });
    const queenMate = rook.getByRole("gridcell", {
      name: /Black queen on h4.*Rook highlight/,
    });
    const rewind = rook.getByRole("button", {
      name: "Retry move",
      exact: true,
    });
    await gPawn.click();
    await g4.click();
    await rook
      .getByRole("button", { name: "Why not g4?", exact: true })
      .click();
    const cue = rook.getByText("What were you trying to do with g4?");
    await expect(cue).toBeInViewport();
    await expect(rook.locator("[data-move-cue-arrow]")).toHaveCount(0);
    await rook.getByRole("button", { name: "Hint", exact: true }).click();
    // Review's first hint lists Black's checks, captures and threats.
    const scan = rook.getByRole("status", {
      name: "Check, capture, threat scan",
    });
    await expect(scan).toContainText("Checks:");
    await expect(scan).toContainText("Captures:");
    await expect(scan).toContainText("Threats:");
    await expect(scan).toBeInViewport();
    await review.screenshot({
      path: test.info().outputPath("review-scan-hint-320.png"),
    });
    await rook.getByRole("button", { name: "More hint", exact: true }).click();
    await expect(scan).toHaveCount(0);
    await expect(
      rook.getByRole("gridcell", { name: /White king on e1.*Rook hint/ }),
    ).toBeVisible();
    await expect(rook.locator("[data-move-cue-arrow]")).toHaveCount(0);
    const showMe = rook.getByRole("button", { name: "Next move", exact: true });
    await expect(showMe).toHaveText("Next move");
    await expect(rewind).toHaveText("Rewind");
    const pausedControls = rook.getByRole("group", { name: "Board playback" });
    await expect
      .poll(() =>
        pausedControls.evaluate((group) => {
          const buttons = [...group.querySelectorAll("button")].map((button) =>
            button.getBoundingClientRect(),
          );
          const rows = Map.groupBy(buttons, (button) => Math.round(button.top));
          const bounds = group.getBoundingClientRect();
          return Math.max(
            ...[...rows.values()].map((row) =>
              Math.abs(
                (Math.min(...row.map((button) => button.left)) +
                  Math.max(...row.map((button) => button.right))) /
                  2 -
                  (bounds.left + bounds.right) / 2,
              ),
            ),
          );
        }),
      )
      .toBeLessThan(2);

    await expect(showMe).toBeInViewport();
    await expect(
      rook
        .getByRole("group", { name: "Board playback" })
        .getByText("Black to move"),
    ).toBeVisible();
    await review.setViewportSize({ width: 420, height: 760 });
    await expect(cue).toBeInViewport();
    await expect(showMe).toBeInViewport();
    const wideDock = rook.locator(".rook-exploration__composer-dock");
    const showRect = await showMe.boundingBox();
    const dockRect = await wideDock.boundingBox();
    expect((showRect?.y ?? 0) + (showRect?.height ?? 0)).toBeLessThan(
      dockRect?.y ?? 0,
    );
    await review.screenshot({
      path: test.info().outputPath("rook-pause-420.png"),
    });
    await review.setViewportSize({ width: 320, height: 760 });
    const chat = rook.getByRole("textbox", { name: "Ask Rook" });
    const boardBeforeQuestion = await rook.getByRole("grid").ariaSnapshot();
    await expect(chat).toBeInViewport({ ratio: 1 });
    await chat.fill("Can Black take the pawn on a2?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    const boardAfterQuestion = await rook.getByRole("grid").boundingBox();
    expect(await rook.getByRole("grid").ariaSnapshot()).toBe(
      boardBeforeQuestion,
    );
    const composerAfterQuestion = await rook
      .locator(".rook-exploration__composer-dock")
      .boundingBox();
    expect(
      (boardAfterQuestion?.y ?? 0) + (boardAfterQuestion?.height ?? 0),
    ).toBeLessThanOrEqual(composerAfterQuestion?.y ?? 0);

    const conversation = rook.getByRole("log", {
      name: "Conversation with Rook",
    });
    await expect(chat).toBeVisible();
    await expect(
      rook.getByRole("meter", { name: "Stockfish evaluation" }),
    ).toHaveAttribute("aria-valuetext", "Black mate");
    await rook
      .getByRole("button", { name: "Talk to Rook", exact: true })
      .click({ timeout: 2_000 });
    const downloadSpeech = rook.getByRole("button", {
      name: "Download speech",
      exact: true,
    });
    await expect(downloadSpeech).toBeInViewport({ ratio: 1 });
    await downloadSpeech.click();
    await rook
      .getByRole("button", { name: "Talk to Rook", exact: true })
      .click();
    await expect(rook.getByText("Listening…")).toBeVisible();
    await rook
      .getByRole("button", { name: "Finish speaking", exact: true })
      .click();
    await expect(chat).toHaveValue("I thought this would develop my bishop");
    await expect(
      conversation.getByText("I thought this would develop my bishop"),
    ).toHaveCount(0);
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    // Saying what they intended shows Black's checked reply and the warning.
    const answer = conversation.getByText(/^You played g4\. .+I played Qh4#/s);
    await expect(answer).toBeVisible();
    const question = conversation.getByText(
      "I thought this would develop my bishop",
    );
    await expect(question).toBeInViewport({ ratio: 1 });
    await expect(answer).toBeInViewport({ ratio: 1 });
    await expect(rook.getByRole("grid")).toBeInViewport({ ratio: 1 });
    const boardBounds = await rook.getByRole("grid").boundingBox();
    const transcriptBounds = await conversation.locator("..").boundingBox();
    if (!boardBounds || !transcriptBounds)
      throw new Error("Missing board or transcript");
    expect(boardBounds.y + boardBounds.height).toBeLessThanOrEqual(
      transcriptBounds.y,
    );
    await review.screenshot({
      path: test.info().outputPath("board-and-conversation-320.png"),
    });
    // Rewind to Rook's question to explore the position before the reply.
    const explanationsBefore = await conversation
      .getByRole("group", { name: "Rook’s move explanation" })
      .count();
    await rook.getByRole("button", { name: "Done", exact: true }).click();
    await rewind.click();
    await gPawn.click();
    await g4.click();
    await rook
      .getByRole("button", { name: "Why not g4?", exact: true })
      .click();
    await expect(cue).toBeVisible();
    await chat.fill("black takes knight?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(
      conversation.getByText(
        "Black can’t legally capture a White knight from this position.",
      ),
    ).toBeVisible();
    const timedMessages = await conversation
      .locator(".rook-chat__message")
      .evaluateAll((messages) =>
        messages.map((message) => ({
          role: message.classList.contains("rook-chat__message--player")
            ? "player"
            : "rook",
          sentAt: Date.parse(message.querySelector("time")?.dateTime ?? ""),
        })),
      );
    expect(timedMessages.slice(-2).map(({ role }) => role)).toEqual([
      "player",
      "rook",
    ]);
    const [questionTime, replyTime] = timedMessages
      .slice(-2)
      .map(({ sentAt }) => sentAt);
    expect(replyTime ?? -1).toBeGreaterThanOrEqual(questionTime ?? Infinity);
    await expect(
      rook.getByRole("button", { name: "Show reply", exact: true }),
    ).toHaveCount(0);

    await chat.fill("Is either side ahead in material?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(conversation.getByText("Material is level.")).toBeVisible({
      timeout: 2_000,
    });

    await expect(queen).toBeVisible();
    await review.screenshot({ path: test.info().outputPath("rook-pause.png") });
    await expect(queen).toBeVisible();
    await expect(
      rook
        .getByRole("group", { name: "Board playback" })
        .getByRole("button", { name: "Next move" }),
    ).toBeVisible();
    await expect(
      conversation.getByRole("group", { name: "Rook’s move explanation" }),
    ).toHaveCount(explanationsBefore);
    await context.setOffline(true);
    const aPawn = rook.getByRole("gridcell", { name: /Black pawn on a7/ });
    await aPawn.click();
    await rook.getByRole("gridcell", { name: /Empty a6/ }).click();
    const retryCue = rook.getByText(
      "That gives up your forced mate. Try another reply.",
    );
    for (const width of [320, 420]) {
      await review.setViewportSize({ width, height: 760 });
      await expect(retryCue).toBeInViewport();
      await expect
        .poll(async () => {
          const controls = await pausedControls.boundingBox();
          const dock = await wideDock.boundingBox();
          return Boolean(
            controls && dock && controls.y + controls.height <= dock.y,
          );
        })
        .toBe(true);
      await expect(aPawn).toBeVisible();
      await expect(showMe).toBeInViewport();
      expect(
        await review.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await review.screenshot({
        path: test.info().outputPath(`opposing-retry-${String(width)}.png`),
      });
    }
    await review.setViewportSize({ width: 320, height: 760 });
    await queen.click();
    await rook.getByRole("gridcell", { name: /Empty h4/ }).click();
    await expect(rook.getByText(/You found it/)).toBeVisible();
    await context.setOffline(false);
    await rook.getByRole("button", { name: "Done", exact: true }).click();
    await expect(queenMate).toBeVisible();
    await rewind.click();
    await gPawn.click();
    await g4.click();
    await rook
      .getByRole("button", { name: "Why not g4?", exact: true })
      .click();
    await showMe.click();
    await rook.getByRole("button", { name: "Done", exact: true }).click();
    await showMe.click();
    await expect(queenMate).toBeVisible();
    const threat = rook.locator('[data-move-cue-arrow="h4:e1"]');
    await expect(threat).toHaveCSS("opacity", "0.58");
    await expect(threat.locator("polygon")).toHaveCSS("stroke", "none");
    const blockedEscape = rook.getByRole("gridcell", {
      name: /White pawn on e2/,
    });
    await expect(blockedEscape).toHaveAttribute("data-board-cue", "×");
    await blockedEscape.click();
    await expect(
      rook.getByText("The king’s own piece occupies e2."),
    ).toBeVisible();
    await expect(
      conversation
        .getByRole("group", { name: "Rook’s move explanation" })
        .last(),
    ).toContainText("ends the game");
    await review.screenshot({
      path: test.info().outputPath("rook-reveal.png"),
    });
    await expect(
      rook.getByRole("gridcell", { name: /White king on e1.*Rook highlight/ }),
    ).toBeVisible();
    await rewind.click();
    await expect(gPawn).toBeVisible();
    await expect(queen).toBeVisible();
    await rook.getByRole("gridcell", { name: "White knight on b1" }).click();
    await rook.getByRole("gridcell", { name: "Empty c3" }).click();
    await expect(
      conversation
        .getByRole("group", { name: "Rook’s move explanation" })
        .last(),
    ).toContainText("You played Nc3.");
    await expect(conversation.getByText(/You played Nc3/)).toBeVisible({
      timeout: 2_000,
    });

    await expect(
      rook
        .getByRole("group", { name: "Board playback" })
        .getByText("White to move"),
    ).toBeVisible();
    await expect(
      rook.getByRole("gridcell", {
        name: /last move ended here, Rook highlight/,
      }),
    ).toBeVisible();
    const boardSignature = async () =>
      rook
        .getByRole("gridcell")
        .evaluateAll((squares) =>
          squares.map(
            (square) => square.getAttribute("aria-label")?.split(",")[0],
          ),
        );
    const explainedPosition = await boardSignature();
    await rook
      .getByRole("textbox", { name: "Ask Rook" })
      .fill("rewind to the original position");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(
      conversation.locator(".rook-chat__message").last(),
    ).toContainText("rewind to the original position", { timeout: 2_000 });
    const rewindMessage = conversation.getByText(
      "rewind to the original position",
      { exact: true },
    );
    expect(
      await rewindMessage.evaluate(
        (message) =>
          message.closest(".rook-chat__message")?.previousElementSibling
            ?.textContent,
      ),
    ).toContain("You played Nc3.");
    const earlierExplanation = conversation
      .getByRole("group", {
        name: "Rook’s move explanation",
      })
      .filter({ hasText: "You played Nc3." })
      .last();
    await earlierExplanation
      .getByRole("button", { name: /View position/ })
      .click({ timeout: 2_000 });
    await expect(
      rook.getByRole("gridcell", { name: /White knight on c3/ }),
    ).toBeVisible();
    expect(await boardSignature()).toEqual(explainedPosition);
    const returnToPosition = rook.getByRole("button", {
      name: "Return to my position",
      exact: true,
    });
    await expect(returnToPosition).toBeInViewport();
    await review.screenshot({
      path: test.info().outputPath("rook-return-position.png"),
    });
    await conversation
      .getByRole("group", { name: "Rook’s move explanation" })
      .filter({ hasText: "I played Qh4#" })
      .last()
      .getByRole("button", { name: /View position/ })
      .click();
    await expect(queenMate).toBeVisible();
    await returnToPosition.click();
    await expect(returnToPosition).toHaveCount(0);

    await expect(
      rook.getByRole("gridcell", { name: "White knight on b1" }),
    ).toBeVisible();
    await rook.getByRole("gridcell", { name: "White knight on b1" }).click();
    await rook.getByRole("gridcell", { name: "Empty a3" }).click();
    await expect(
      rook.getByRole("gridcell", {
        name: /last move ended here, Rook highlight/,
      }),
    ).toBeVisible();
    await rook
      .getByRole("textbox", { name: "Ask Rook" })
      .fill("What happens next?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    const playback = rook.getByRole("group", { name: "Board playback" });
    await playback.getByRole("button", { name: "Next move" }).click();
    await expect(
      rook.getByRole("button", { name: "Back to my position" }),
    ).toBeVisible();
    await expect(
      rook.getByRole("gridcell", {
        name: /last move ended here, Rook highlight/,
      }),
    ).toBeVisible();
    await review.clock.install();
    await expect(
      rook.getByRole("meter", { name: "Stockfish evaluation" }),
    ).toBeVisible();
    await playback.getByRole("button", { name: "Hide conversation" }).click();
    await playback.getByRole("button", { name: "Discuss position" }).click();
    await expect(chat).toBeFocused();
    await chat.fill("Who is attacking e4?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(conversation.getByText(/Pieces attacking e4/)).toBeVisible();
    await expect(
      rook.getByRole("gridcell", { name: /(?:on |Empty )e4.*Rook highlight/ }),
    ).toBeVisible();
    const latest = conversation.getByText(/Pieces attacking e4/);
    await expect(latest).toBeInViewport();
    expect(
      await latest.evaluate((reply) => {
        const input = document.getElementById("rook-exploration-question");
        return (
          input !== null &&
          Boolean(
            reply.compareDocumentPosition(input) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          )
        );
      }),
    ).toBe(true);

    await expect(playback.getByText(/^1 of /)).toBeVisible();
    const checkedPosition = await boardSignature();
    const checkedExplanation = conversation
      .getByRole("group", { name: "Rook’s move explanation" })
      .last();
    await playback.getByRole("button", { name: "Previous move" }).click();
    await expect(playback.getByText(/^1 of /)).toHaveCount(0);
    await checkedExplanation
      .getByRole("button", { name: /View position/ })
      .click();
    expect(await boardSignature()).toEqual(checkedPosition);
    await returnToPosition.click();
    await expect(playback.getByText(/^1 of /)).toHaveCount(0);
    await playback.getByRole("button", { name: "Next move" }).click();
    expect(await boardSignature()).toEqual(checkedPosition);
    await earlierExplanation
      .getByRole("button", { name: /View position/ })
      .click();
    await returnToPosition.click();
    await expect(playback.getByText(/^1 of /)).toBeVisible();
    expect(await boardSignature()).toEqual(checkedPosition);

    await review.clock.runFor(8_000);
    await expect(playback.getByText(/^1 of /)).toBeVisible();
    await review.screenshot({
      path: test.info().outputPath("rook-checked-line.png"),
    });
    await rook.getByRole("button", { name: "Back to my position" }).click();
    await expect(
      rook.getByRole("gridcell", { name: /White knight on a3/ }),
    ).toBeVisible();
    await rook.getByRole("button", { name: "Hide conversation" }).click();
    await expect(
      rook.getByText("Explored positions", { exact: true }),
    ).toHaveCount(0);
    await playback
      .getByRole("button", { name: "Back to start", exact: true })
      .click();
    await expect(
      rook.getByRole("gridcell", { name: "White knight on b1" }),
    ).toBeVisible();
    await rook
      .getByRole("textbox", { name: "Ask Rook" })
      .fill("Show me a line from here");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await playback.getByRole("button", { name: "Next move" }).click();
    await review.clock.runFor(8_000);
    await expect(playback.getByText(/^1 of /)).toBeVisible();
    await chat.fill("What if I play h6?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(
      conversation.getByText(/After h6, Stockfish found/),
    ).toBeVisible();
    await expect(
      conversation.getByText("What if I play h6?", { exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await expect(rook.getByRole("grid")).toBeInViewport({ ratio: 1 });
    const files = rook.locator(".chess-board__edge-coordinate--file");
    const ranks = rook.locator(".chess-board__edge-coordinate--rank");
    await expect(files).toHaveText(["a", "b", "c", "d", "e", "f", "g", "h"]);
    await expect(ranks).toHaveText(["8", "7", "6", "5", "4", "3", "2", "1"]);
    await expect(files.first()).toBeVisible();
    await expect(ranks.first()).toBeVisible();
    await expect(
      rook.getByRole("gridcell", { name: /Black pawn on h6/ }),
    ).toBeVisible();
    await expect(rook.locator("[data-move-cue-arrow]").first()).toBeVisible();
    const tryMove = rook.getByRole("button", { name: "Try a different move" });
    const tryBounds = await tryMove.boundingBox();
    const returnBounds = await returnToPosition.boundingBox();
    expect(tryBounds?.y).toBe(returnBounds?.y);
    await review.screenshot({
      path: test.info().outputPath("rook-reply-on-board.png"),
    });
    const recapture = conversation.getByRole("button", {
      name: "Qxd4",
      exact: true,
    });
    if (await recapture.count()) {
      await expect(
        rook.getByRole("gridcell", { name: /White queen on d4/ }),
      ).toBeVisible({ timeout: 8000 });
      await expect(recapture).toHaveAttribute("aria-current", "step");
      await review.screenshot({
        path: test.info().outputPath("rook-exchange-autoplay.png"),
      });
    }
    await tryMove.click();
    await expect(
      rook.getByRole("gridcell", { name: /Black pawn on h6/ }),
    ).toBeVisible();
    await rook.getByRole("gridcell", { name: /White pawn on d2/ }).click();
    await rook
      .getByRole("gridcell", { name: /Empty d3.*legal destination/ })
      .click();
    await expect(
      conversation.getByText(/After d3, Stockfish found/),
    ).toBeVisible();
    await expect(
      rook
        .getByRole("group", { name: "Board playback" })
        .getByText(/^\d+ of \d+ · .+ · White to move$/),
    ).toBeVisible();
    await returnToPosition.click();
    await expect(playback.getByText(/^1 of /)).toBeVisible();
    for (const [width, height] of [
      [320, 640],
      [420, 760],
      [320, 760],
    ] as const) {
      await review.setViewportSize({ width, height });
      const currentBoard = rook.getByRole("grid");
      const currentQuestion = conversation.getByText("What if I play h6?", {
        exact: true,
      });
      const currentReply = conversation.getByText(/After h6, Stockfish found/);
      await expect(currentBoard).toBeInViewport({ ratio: 1 });
      await expect(currentQuestion).toBeInViewport({ ratio: 1 });
      await expect(currentReply).toBeInViewport({ ratio: 1 });
      await expect
        .poll(async () => {
          const grid = await currentBoard.boundingBox();
          const dock = await wideDock.boundingBox();
          return Boolean(
            grid && dock && grid.y >= 0 && grid.y + grid.height <= dock.y,
          );
        })
        .toBe(true);
      await review.screenshot({
        path: test
          .info()
          .outputPath(`rook-chat-${String(width)}x${String(height)}.png`),
      });
    }
    const blackPawn = rook.getByRole("gridcell", { name: /Black pawn on h7/ });
    await blackPawn.click({ timeout: 3_000 });
    await rook
      .getByRole("gridcell", { name: /Empty h6, legal destination/ })
      .click();
    await expect(
      rook.getByRole("gridcell", { name: /Black pawn on h6/ }),
    ).toBeVisible();
    await expect(
      rook.getByRole("button", { name: "Back to my position" }),
    ).toHaveCount(0);
    expect(
      await review.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await review.goto(url + "#lichess/abcdef12");
    await review.getByRole("button", { name: "White · Mira" }).click();
    await expect(review).toHaveURL(saved);
    status = "started";
    await review.goto(url + "#lichess/abcdef12/mira");
    await expect(review.getByRole("alert")).toContainText(
      "Only finished games",
    );
    await expect(fullReplay).toHaveCount(0);
    await context.setOffline(true);
    await review.goto(saved);
    await review.reload();
    await expect(rook.getByLabel("Ask Rook")).toBeVisible();
    await expect(
      rook.getByRole("gridcell", { name: /White pawn on g2/ }),
    ).toBeVisible();
    await expect(fullReplay).toHaveCount(0);
    await expect(review).toHaveURL(saved);
    await review.goto(url);
    await review
      .getByRole("list", { name: "Completed games" })
      .getByRole("button")
      .click();
    await expect(review).toHaveURL(saved);
    await expect(rook.getByLabel("Ask Rook")).toBeVisible();
    await reviewNavigation
      .getByRole("button", { name: "Back to Review" })
      .click();
    await review.getByRole("button", { name: "Practice", exact: true }).click();
    await review
      .getByRole("button", { name: /See the opponent’s next threat/ })
      .click();
    await expect(
      review.getByRole("button", { name: "Back to Practice" }),
    ).toBeVisible();
    await expect(
      review.getByRole("heading", { name: "Find the first move" }),
    ).toHaveCount(0);
    await expect(review.locator(".rook-exploration__heading p")).toHaveCount(0);
    await reviewNavigation
      .getByRole("button", { name: "Back to Practice" })
      .click();
    await review.getByRole("button", { name: "Play", exact: true }).click();
    await review.getByRole("button", { name: "Rated", exact: true }).click();
    const board = review.getByRole("grid").first();
    await expect(
      review.getByRole("button", { name: "Resign game" }),
    ).toBeHidden();
    await expect(board).toBeVisible();
    const size = await board.boundingBox();
    expect(size?.width).toBeGreaterThanOrEqual(0.92 * 320);
    expect(
      await review.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await review.getByRole("gridcell", { name: "White pawn on e2" }).click();
    await review.getByRole("gridcell", { name: "Empty e4" }).click();
    await review.getByText("Game details", { exact: true }).click();
    await expect(
      review.getByRole("list", { name: "Move history" }).getByRole("listitem"),
    ).toHaveCount(2);
  } finally {
    await context.close();
  }
});

test("shows the entire board, question and four-line reply together in the panel", async () => {
  const { context, url } = await openPanel();
  try {
    const review = await context.newPage();
    await review.setViewportSize({ width: 320, height: 640 });
    await context.setOffline(true);
    await review.goto(url + "#import");
    await review
      .getByLabel("Paste completed PGN games")
      .fill(
        '[SetUp "1"]\n[FEN "r3k2r/pp1q1ppp/2p1pn2/3p4/2P1PN2/2NP4/PP1QBPPP/R3K2R w KQkq - 0 12"]\n[Result "1/2-1/2"]\n\n12. O-O 1/2-1/2',
      );
    await review.getByRole("radio", { name: "I played White" }).check();
    await review
      .getByRole("main")
      .getByRole("button", { name: "Import games", exact: true })
      .click();
    const rook = review.getByRole("region", { name: "Explore with Rook" });
    const query = "Which pieces are attacking d5?";
    const composer = rook.getByRole("textbox", { name: "Ask Rook" });
    const currentBoard = rook.getByRole("grid");
    await expect(composer).toBeVisible();
    await expect(rook.getByText("Ask Rook", { exact: true })).toHaveCount(0);
    const boardWidth = () =>
      currentBoard.evaluate((board) => board.getBoundingClientRect().width);
    const originalWidth = await boardWidth();
    await composer.fill(query);
    const boardBefore = await currentBoard.boundingBox();
    const composerBefore = await composer.boundingBox();
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    const log = rook.getByRole("log", { name: "Conversation with Rook" });
    const currentQuestion = log.getByText(query, { exact: true });
    const currentReply = log.getByText(/^Pieces attacking d5:/);
    await expect(currentReply).toBeVisible();
    expect(await boardWidth()).toBe(originalWidth);
    expect(await currentBoard.boundingBox()).toEqual(boardBefore);
    expect(await composer.boundingBox()).toEqual(composerBefore);
    const wideDock = rook.locator(".rook-exploration__composer-dock");
    // Review keeps 13 px of the board's width for the Stockfish bar.
    for (const [width, height, minimumBoardWidth] of [
      [320, 640, 167],
      [420, 760, 317],
      [320, 760, 283],
    ] as const) {
      await review.setViewportSize({ width, height });
      const openWidth = await boardWidth();
      const openBoard = await currentBoard.boundingBox();
      const openComposer = await composer.boundingBox();
      expect(openWidth).toBeGreaterThanOrEqual(minimumBoardWidth);
      await rook.getByRole("button", { name: "Hide conversation" }).click();
      await expect(log).toBeHidden();
      expect(await boardWidth()).toBe(openWidth);
      expect(await currentBoard.boundingBox()).toEqual(openBoard);
      expect(await composer.boundingBox()).toEqual(openComposer);
      await rook.getByRole("button", { name: "Discuss position" }).click();
      expect(await boardWidth()).toBe(openWidth);
      expect(await currentBoard.boundingBox()).toEqual(openBoard);
      expect(await composer.boundingBox()).toEqual(openComposer);
      await expect(currentBoard).toBeInViewport({ ratio: 1 });
      await expect(currentQuestion).toBeInViewport({ ratio: 1 });
      await expect(currentReply).toBeInViewport({ ratio: 1 });
      await expect
        .poll(async () => {
          const grid = await currentBoard.boundingBox();
          const dock = await wideDock.boundingBox();
          const header = await review.getByRole("banner").boundingBox();
          return Boolean(
            grid &&
            dock &&
            header &&
            grid.y >= header.y + header.height - 1 &&
            grid.y + grid.height <= dock.y,
          );
        })
        .toBe(true);
      if (width === 320) {
        const lines = await currentReply.evaluate((reply) => {
          const text = document.createRange();
          text.selectNodeContents(reply);
          return new Set(Array.from(text.getClientRects(), (rect) => rect.top))
            .size;
        });
        expect(lines).toBeGreaterThanOrEqual(4);
      }
      await review.screenshot({
        path: test
          .info()
          .outputPath(`rook-chat-${String(width)}x${String(height)}.png`),
      });
    }
  } finally {
    await context.close();
  }
});
