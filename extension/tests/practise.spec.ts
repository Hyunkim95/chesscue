/// <reference types="chrome" />
import { chromium, expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("opens the finished game from Lichess, reuses its review and plays offline", async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    viewport: { width: 320, height: 760 },
    args: ["--enable-unsafe-extension-debugging"],
    ignoreDefaultArgs: ["--disable-extensions"],
  });
  try {
    const browser = context.browser();
    if (!browser) throw new Error("No extension-capable Chrome connection.");
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send("Extensions.loadUnpacked", {
      path: resolve("extension/dist"),
    });
    const url = "chrome-extension://" + id + "/index.html?panel=1";
    const page = await context.newPage();
    const site = "https://lichess.org/abcdef12/white";
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
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onresult:
          | ((event: {
              results: { isFinal: boolean; 0: { transcript: string } }[];
            }) => void)
          | null = null;
        start() {
          if (!this.processLocally)
            throw new Error("Expected on-device speech");
          this.onstart?.();
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
    const debrief = review.getByRole("region", { name: "Game debrief" });
    await expect(debrief).toBeVisible({ timeout: 30000 });
    const rook = review.getByRole("region", { name: "Explore with Rook" });
    const reviewNavigation = review.getByRole("navigation", {
      name: "Game review controls",
    });
    const explore = debrief.getByRole("button", {
      name: "Explore with Rook",
      exact: true,
    });
    await expect(
      reviewNavigation.getByRole("button", { name: "Back to Review" }),
    ).toBeVisible();
    await debrief.getByRole("button", { name: "Previous move" }).click();
    await explore.click();
    await expect(
      review.getByRole("button", { name: "Review", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      review.getByRole("link", { name: "Lichess game" }),
    ).toHaveAttribute("href", "https://lichess.org/abcdef12");
    await expect(
      rook.getByText("After 1... e5 · White’s position"),
    ).toBeVisible();
    const gPawn = rook.getByRole("gridcell", { name: /White pawn on g2/ });
    const g4 = rook.getByRole("gridcell", { name: /Empty g4/ });
    const queen = rook.getByRole("gridcell", { name: /Black queen on d8/ });
    const queenMate = rook.getByRole("gridcell", {
      name: /Black queen on h4.*Rook highlight/,
    });
    const rewind = rook.getByRole("button", { name: "Rewind", exact: true });
    await gPawn.click();
    await g4.click();
    const cue = rook.getByText(/Are you sure/);
    await expect(cue).toBeInViewport();
    const showMe = rook.getByRole("button", { name: "Show me", exact: true });
    await expect(showMe).toHaveText("Show me");
    await expect(rewind).toHaveText("Rewind");
    const pausedControls = rook.getByRole("group", { name: "Board playback" });
    await expect
      .poll(() =>
        pausedControls.evaluate((group) => {
          const buttons = [...group.querySelectorAll("button")];
          const first = buttons[0]?.getBoundingClientRect();
          const last = buttons.at(-1)?.getBoundingClientRect();
          const bounds = group.getBoundingClientRect();
          return first && last
            ? Math.abs(
                (first.left + last.right) / 2 -
                  (bounds.left + bounds.right) / 2,
              )
            : Number.POSITIVE_INFINITY;
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
    const boardBeforeQuestion = await rook.getByRole("grid").boundingBox();
    await expect
      .poll(() =>
        chat.evaluate(
          (input) => window.innerHeight - input.getBoundingClientRect().bottom,
        ),
      )
      .toBeLessThan(20);
    await chat.fill("Can Black take the pawn on a2?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    const boardAfterQuestion = await rook.getByRole("grid").boundingBox();
    expect(boardAfterQuestion?.y).toBe(boardBeforeQuestion?.y);
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
    await rook
      .getByRole("button", { name: "Download speech", exact: true })
      .click();
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
    await expect(conversation.getByText(/looking for checks/)).toBeVisible();
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
    ).toBeVisible();

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
        .getByRole("button", { name: "Show me" }),
    ).toBeVisible();
    await expect(
      conversation.getByRole("group", { name: "Rook’s move explanation" }),
    ).toHaveCount(0);
    await expect(
      rook.getByRole("button", { name: "Play one move" }),
    ).toHaveCount(0);
    await context.setOffline(true);
    const aPawn = rook.getByRole("gridcell", { name: /Black pawn on a7/ });
    await aPawn.click();
    await rook.getByRole("gridcell", { name: /Empty a6/ }).click();
    const retryCue = rook.getByText(/misses the forced mate/i);
    for (const width of [320, 420]) {
      await review.setViewportSize({ width, height: 760 });
      await expect(retryCue).toBeInViewport();
      const controlsBox = await pausedControls.boundingBox();
      const retryDock = await wideDock.boundingBox();
      expect(
        (controlsBox?.y ?? 0) + (controlsBox?.height ?? 0),
      ).toBeLessThanOrEqual(retryDock?.y ?? 0);
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
    await expect(queenMate).toBeVisible();
    await rewind.click();
    await gPawn.click();
    await g4.click();
    await rook.getByRole("button", { name: "Show reply", exact: true }).click();
    await expect(queenMate).toBeVisible();
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
          squares.map((square) => square.getAttribute("aria-label")),
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
    await playback.getByRole("button", { name: "Play one move" }).click();
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
    await playback.getByRole("button", { name: "Discuss position" }).click();
    await expect(chat).toBeFocused();
    await chat.fill("Who is attacking e4?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(conversation.getByText(/Pieces attacking e4/)).toBeVisible();
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
    await playback.getByRole("button", { name: "Play one move" }).click();
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
    await rook.getByText("Explored positions").click();
    await rook.getByRole("button", { name: "Nc3", exact: true }).click();
    await expect(
      rook.getByRole("gridcell", { name: "White knight on c3" }),
    ).toBeVisible();
    await rook
      .getByRole("button", { name: "Back to start", exact: true })
      .click();
    await rook
      .getByRole("textbox", { name: "Ask Rook" })
      .fill("Show me a line from here");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await playback.getByRole("button", { name: "Play one move" }).click();
    await review.clock.runFor(8_000);
    await expect(playback.getByText(/^1 of /)).toBeVisible();
    await chat.fill("What if I play h6?");
    await rook.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(
      conversation.getByText(/After h6, Stockfish found/),
    ).toBeVisible();
    await expect(playback.getByText(/^1 of /)).toBeVisible();
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
    await expect(explore).toHaveCount(0);
    await context.setOffline(true);
    await review.goto(saved);
    await review.reload();
    await expect(debrief).toBeVisible();
    await explore.click();
    await expect(
      rook.getByRole("gridcell", { name: /White pawn on g4/ }),
    ).toBeVisible();
    await reviewNavigation
      .getByRole("button", { name: "Back to game debrief", exact: true })
      .click();
    await expect(debrief).toBeVisible();
    await expect(
      debrief.getByRole("gridcell", { name: /White pawn on g4/ }),
    ).toBeVisible();
    await expect(review).toHaveURL(saved);
    await review.goto(url);
    await review.getByRole("button", { name: "Resume last review" }).click();
    await expect(review).toHaveURL(saved);
    await expect(debrief).toBeVisible();
    await review.getByRole("button", { name: "Practice", exact: true }).click();
    const followUp = review.getByRole("region", {
      name: "Mistakes from PGN reviews",
    });
    await review.screenshot({
      path: test.info().outputPath("rook-practice-follow-up.png"),
    });
    await followUp
      .getByRole("button", { name: "Retry g4", exact: true })
      .click();
    await expect(
      review.getByRole("heading", { name: "Retry move 2" }),
    ).toBeVisible();
    await review.getByRole("button", { name: "Play", exact: true }).click();
    await review.getByRole("button", { name: "Rated", exact: true }).click();
    const board = review.getByRole("grid").first();
    await expect(board).toBeVisible();
    const size = await board.boundingBox();
    expect(size?.width).toBeGreaterThanOrEqual(0.92 * 320);
    expect(
      await review.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await review.getByRole("gridcell", { name: "White pawn on e2" }).click();
    await review.getByRole("gridcell", { name: "Empty e4" }).click();
    await expect(
      review.getByRole("list", { name: "Move history" }).getByRole("listitem"),
    ).toHaveCount(2);
  } finally {
    await context.close();
  }
});
