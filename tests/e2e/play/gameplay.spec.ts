import { expect, test, type Page } from "@playwright/test";
import { Chess } from "chess.js";

test("plays a legal move and receives a CPU reply without live coaching", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("grid", { name: "Chess board, White side" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(/Your move/, {
    timeout: 10_000,
  });

  await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
  await page.getByRole("gridcell", { name: "Empty e4" }).click();

  await expect(
    page.getByRole("gridcell", { name: "White pawn on e4" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Your move", {
    timeout: 5_000,
  });
  const moveHistory = page.getByRole("list", { name: "Move history" });
  await expect(moveHistory.getByText("e4")).toBeVisible();
  await expect(moveHistory.getByRole("listitem")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Rook", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Rook chat" })).toHaveCount(0);
});

test("continues the same board with Rook only after switching to unrated", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Your move");
  await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
  await page.getByRole("gridcell", { name: "Empty e4" }).click();
  await expect(page.getByRole("status")).toHaveText("Your move");
  const history = page
    .getByRole("list", { name: "Move history" })
    .getByRole("listitem");
  const originalMoves = await history.allTextContents();
  await page
    .getByRole("button", { name: "Continue unrated with Rook" })
    .click();
  const rook = page.getByRole("button", { name: "Rook", exact: true });
  await expect(rook).toHaveAttribute("aria-expanded", "false");
  await expect(history).toHaveText(originalMoves);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Play with Rook" }),
  ).toBeVisible();
  await expect(history).toHaveText(originalMoves);
  await expect(rook).toHaveAttribute("aria-expanded", "false");
});

test("resigns and offers another game", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText(/Your move/, {
    timeout: 10_000,
  });

  await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
  await page.getByRole("gridcell", { name: "Empty e4" }).click();
  await expect(page.getByRole("status")).toHaveText("Your move", {
    timeout: 10_000,
  });

  await page.getByRole("button", { name: "Resign game" }).click();

  await expect(
    page.getByRole("heading", { name: "Your game, rewound" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Back to training plan" }),
  ).toBeVisible();
});

test("reload resumes the exact in-progress tutor game", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText(/Your move/, {
    timeout: 10_000,
  });
  await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
  await page.getByRole("gridcell", { name: "Empty e4" }).click();
  await expect(page.getByRole("status")).toHaveText("Your move", {
    timeout: 10_000,
  });

  const movesBeforeReload = await page
    .getByRole("list", { name: "Move history" })
    .getByRole("listitem")
    .allTextContents();
  await page.reload();

  await expect(page.getByRole("status")).toHaveText("Your move", {
    timeout: 10_000,
  });
  await expect(
    page.getByRole("gridcell", { name: "White pawn on e4" }),
  ).toBeVisible();
  const history = page.getByRole("list", { name: "Move history" });
  await expect(history.getByText("e4")).toBeVisible();
  await expect(history.getByRole("listitem")).toHaveText(movesBeforeReload);
});

async function resumeCoachedGame(
  page: Page,
  chess: Chess,
  startingMoves: readonly string[],
) {
  const initialFen = chess.fen();
  const playedAt = "2026-11-25T08:00:00.000Z";
  const moves = startingMoves.map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      san: move.san,
      uci: move.lan,
      fenAfter: chess.fen(),
      playedAt,
    };
  });
  const game = {
    schemaVersion: 1,
    id: `coached-${String(startingMoves.length)}-sample`,
    origin: {
      type: "tutor",
      mode: "coached",
      trainingFocus: "one-move-threat",
      openingPolicyVersion: "focus-openings@1",
      opponentElo: 1450,
    },
    initialFen,
    moves,
    pgn: chess.pgn(),
    playerColor: "white",
    result: null,
    createdAt: playedAt,
    completedAt: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    fingerprint: null,
  };
  await page.evaluate(async (record) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("adaptive-chess-tutor");
      open.onerror = () => {
        reject(open.error ?? new Error("Opening game storage failed"));
      };
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction("games", "readwrite");
        transaction.objectStore("games").put(record);
        transaction.onerror = () => {
          reject(transaction.error ?? new Error("Saving the fixture failed"));
        };
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  }, game);
  await page.getByRole("button", { name: "Change game mode" }).click();
  await page.getByRole("button", { name: "Coached", exact: true }).click();
}

test.describe("Coached sideline", () => {
  test("Rook flags when the opponent takes a piece you just moved", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("status")).toHaveText("Your move");
    await resumeCoachedGame(
      page,
      new Chess("5rk1/pp4pp/8/8/8/8/PP5P/3QK3 w - - 0 1"),
      [],
    );
    const rook = page.getByRole("button", { name: "Rook", exact: true });
    await expect(rook).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("gridcell", { name: "White queen on d1" }).click();
    await page.getByRole("gridcell", { name: "Empty f3" }).click();
    await expect(
      page.getByRole("gridcell", { name: "Black rook on f3" }),
    ).toBeVisible({ timeout: 10_000 });
    const unread = page.getByRole("button", {
      name: "Rook, new learning moment",
      exact: true,
    });
    await expect(unread).toHaveAttribute("aria-expanded", "false");
    await expect(unread.locator(".rook-toggle__dot")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Your move");
    await unread.click();
    const chat = page.getByRole("region", { name: "Rook chat" });
    await expect(chat).toContainText("Your queen was taken on f3");
    await chat.getByRole("button", { name: "Replay this moment" }).click();
    const replay = chat.getByRole("grid", { name: "Sideline replay board" });
    await expect(
      replay.getByRole("gridcell", { name: "White queen on d1" }),
    ).toBeVisible();
    const next = chat.getByRole("button", { name: "Show next move" });
    await next.click();
    await expect(
      replay.getByRole("gridcell", { name: "White queen on f3" }),
    ).toBeVisible();
    await next.click();
    await expect(
      replay.getByRole("gridcell", { name: "Black rook on f3" }),
    ).toBeVisible();
  });

  test("Rook flags the move without pausing and answers typed and spoken questions", async ({
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      class TestSpeechRecognition {
        static available() {
          return Promise.resolve("available");
        }
        processLocally = false;
        onstart: (() => void) | null = null;
        onresult: ((event: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          document.documentElement.dataset.rookSpeech = this.processLocally
            ? "local"
            : "online";
          this.onstart?.();
        }
        stop() {
          this.onresult?.({
            results: [
              { 0: { transcript: "What mate was available?" }, isFinal: true },
            ],
          });
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
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Rated game" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Your move", {
      timeout: 10_000,
    });
    await resumeCoachedGame(page, new Chess(), [
      "e4",
      "e5",
      "Bc4",
      "Nc6",
      "Qh5",
      "Nf6",
    ]);
    await expect(
      page.getByRole("heading", { name: "Play with Rook" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Your move");
    await page.getByRole("gridcell", { name: "White pawn on a2" }).click();
    await page.getByRole("gridcell", { name: "Empty a3" }).click();
    const notes = page.getByRole("button", {
      name: "Rook, new learning moment",
      exact: true,
    });
    await expect(notes).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".rook-float")).toHaveCSS("position", "fixed");
    const speech = page.locator(".rook-float__speech");
    await expect(speech).toHaveCount(0);
    const initialBox = await notes.boundingBox();
    if (initialBox === null) throw new Error("Rook is outside the viewport");
    const centerX = initialBox.x + initialBox.width / 2;
    const centerY = initialBox.y + initialBox.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX - 90, centerY - 90, { steps: 5 });
    await page.mouse.up();
    const draggedBox = await notes.boundingBox();
    if (draggedBox === null) throw new Error("Rook disappeared after dragging");
    expect(draggedBox.x).toBeCloseTo(initialBox.x - 90, 0);
    expect(draggedBox.y).toBeCloseTo(initialBox.y - 90, 0);
    await expect(notes).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText("A mate was available")).toBeHidden();
    await expect(
      page.getByRole("list", { name: "Move history" }).getByRole("listitem"),
    ).toHaveCount(8);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.grantPermissions(["microphone"]);
    await context.setOffline(true);
    await notes.click();
    const chat = page.getByRole("region", { name: "Rook chat" });
    await expect(chat.getByText("A mate was available")).toBeVisible();
    await expect(speech).toHaveText("A mate was available");
    await expect(chat.locator(".rook-chat__avatar")).toBeVisible();
    const launcher = page.getByRole("button", { name: "Rook", exact: true });
    await expect(launcher).toHaveAttribute("aria-expanded", "true");
    await expect(chat).toHaveCSS("position", "relative");
    const dock = await chat.boundingBox();
    const speechBox = await speech.boundingBox();
    const openBox = await launcher.boundingBox();
    if (dock === null || openBox === null || speechBox === null)
      throw new Error("Rook or the chat dock is missing");
    const center = openBox.x + openBox.width / 2;
    const y = openBox.y + openBox.height / 2;
    await page.mouse.move(center, y);
    await page.mouse.down();
    await page.mouse.move(center - 35, y, { steps: 3 });
    await page.mouse.up();
    const openDragged = await launcher.boundingBox();
    expect(openDragged?.x).toBeCloseTo(openBox.x - 35, 0);
    expect((await speech.boundingBox())?.x).toBeCloseTo(speechBox.x - 35, 0);
    expect(await chat.boundingBox()).toEqual(dock);
    await expect(launcher).toHaveAttribute("aria-expanded", "true");
    await chat
      .getByRole("textbox", { name: "Message Rook" })
      .fill("I wanted to push a pawn.");
    await chat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(chat.getByText("I wanted to push a pawn.")).toBeVisible();
    await expect(
      chat.getByText(/What did you expect your opponent to do next/),
    ).toBeVisible();
    const mic = chat.getByRole("button", { name: "Talk to Rook", exact: true });
    await expect(mic.locator(".rook-chat__mic")).toBeVisible();
    await mic.click();
    const stop = chat.getByRole("button", { name: "Finish speaking" });
    await expect(stop).toBeEnabled();
    await expect(page.locator("html")).toHaveAttribute(
      "data-rook-speech",
      "local",
    );
    const board = page.getByRole("grid", { name: "Chess board, White side" });
    await board.getByRole("gridcell", { name: "White pawn on b2" }).click();
    await board.getByRole("gridcell", { name: "Empty b3" }).click();
    await expect(
      board.getByRole("gridcell", { name: "White pawn on b3" }),
    ).toBeVisible();
    await expect(chat).toBeVisible();
    await stop.click();
    await expect(chat.getByText("What mate was available?")).toBeVisible();
    await expect(
      chat.getByRole("button", { name: "Show on the board" }),
    ).toHaveCount(2);
    await expect(chat.locator(".rook-chat__turn").last()).toContainText(
      "Qxf7#",
    );
    await expect(chat.locator("audio")).toHaveCount(0);
    await page.reload();
    const rook = page.getByRole("button", { name: "Rook", exact: true });
    await expect(rook).toHaveAttribute("aria-expanded", "false");
    const restoredBox = await rook.boundingBox();
    expect(restoredBox?.x).toBeCloseTo(draggedBox.x - 35, 0);
    expect(restoredBox?.y).toBeCloseTo(draggedBox.y, 0);
    await rook.focus();
    await rook.press("ArrowUp");
    expect((await rook.boundingBox())?.y).toBeCloseTo(draggedBox.y - 16, 0);
    await rook.click();
    await expect(chat.getByText("I wanted to push a pawn.")).toBeVisible();
    await expect(chat.getByText("What mate was available?")).toBeVisible();
    await chat.getByRole("button", { name: "Replay this moment" }).click();
    await expect(
      chat.getByRole("grid", { name: "Sideline replay board" }),
    ).toBeVisible();
    await expect(
      page.getByRole("grid", { name: "Chess board, White side" }),
    ).toBeVisible();
    await chat.getByRole("button", { name: "Close replay" }).click();
    await chat
      .getByRole("checkbox", { name: "Flag learning moments" })
      .uncheck();
    await expect(page.getByText("A mate was available")).toBeHidden();
    await expect(chat.getByText("I wanted to push a pawn.")).toBeVisible();
    await context.setOffline(false);
    await page.getByRole("button", { name: "Change game mode" }).click();
    await page.getByRole("button", { name: "Rated", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Your move");
    await expect(
      page.getByRole("gridcell", { name: "White pawn on a2" }),
    ).toBeVisible();
    await expect(rook).toHaveCount(0);
    await page.getByRole("button", { name: "Change game mode" }).click();
    await page.getByRole("button", { name: "Coached", exact: true }).click();
    await expect(
      page.getByRole("gridcell", { name: "White pawn on a3" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resign game" }).click();
    await expect(
      page.getByRole("heading", { name: "Your game, rewound" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Back to training plan" }).click();
    await page.getByRole("button", { name: "Account", exact: true }).click();
    await expect(page.getByRole("region", { name: "Your Elo" })).toContainText(
      "Placement · 0 of 5",
    );
  });
});
