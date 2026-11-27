import { expect, test, type Page } from "@playwright/test";

// The player steps through Rook's lines, asks why not their own try, plays
// another move at their turn and asks about the frame on the board.

const square = (page: Page, name: string) =>
  page.locator(`[role=gridcell][aria-label^="${name}"]`).first();

test.use({ viewport: { width: 360, height: 800 } });

test("a player steps through the answer, branches with their own move and asks about a frame", async ({
  page,
  context,
}) => {
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  const bubble = page.locator(".rook-bubble__text");
  const stepper = page.getByRole("group", { name: "Step through the line" });
  const next = page.getByRole("button", { name: "Next step" });
  const previous = page.getByRole("button", { name: "Previous step" });

  // A not-best try, then why not: the try and what it costs, never the answer.
  await square(page, "White rook on f1").click();
  await square(page, "Empty f2").click();
  await expect(bubble).toContainText("Something much stronger was here", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Why not Rf2?" }).click();
  await expect(bubble).toContainText(/^Rf2/);
  await expect(stepper).toContainText("1 /");
  while (await next.isEnabled()) {
    await next.click();
    await expect(bubble).not.toContainText("Qxg5");
  }
  await expect(page.locator("[data-move-cue-arrow='g4:g5']")).toHaveCount(0);

  // Show me opens the answer on its first step and waits for the player.
  await page.getByRole("button", { name: "Show me" }).click();
  await expect(stepper).toContainText("1 / 3");
  await expect(bubble).toContainText("Qxg5+");
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(stepper).toContainText("2 / 3");
  await expect(bubble).toHaveText("I have to play Kh8.");
  await previous.click();
  await expect(stepper).toContainText("1 / 3");
  await previous.press("ArrowRight");
  await expect(bubble).toHaveText("I have to play Kh8.");

  // White to move again: Qh6 instead of Qg7#.
  await square(page, "White queen on g5").click();
  await square(page, "Empty h6").click();
  const back = page.getByRole("button", { name: "◀ Back to the answer" });
  await expect(back).toBeVisible({ timeout: 30_000 });
  await expect(bubble).toContainText(/^Qh6/);
  while (await next.isEnabled()) await next.click();
  await expect(bubble).toHaveText("Qg7# instead is checkmate.");
  await expect(page.locator("[data-move-cue-arrow='g5:g7']")).toHaveCount(1);
  await back.click();
  await expect(stepper).toContainText("2 / 3");
  await expect(bubble).toHaveText("I have to play Kh8.");

  // A typed "why" about a move in the line is answered by code, offline
  // too, and the board stays on the frame.
  await context.setOffline(true);
  const ask = page.getByRole("textbox", { name: "Ask Rook" });
  await ask.fill("why Kh8?");
  await ask.press("Enter");
  await expect(bubble).toHaveText("Kh8 is my only legal move.");
  await expect(stepper).toContainText("2 / 3");
  await expect(square(page, "Black king on h8")).toBeVisible();
  await next.click();
  await expect(bubble).toHaveText("Qg7# is checkmate.");
});

test("a question in words is answered on the step without moving the board", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  const bubble = page.locator(".rook-bubble__text");
  const stepper = page.getByRole("group", { name: "Step through the line" });
  await page.getByRole("button", { name: "Show me" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(stepper).toContainText("3 / 3");
  const queen = square(page, "White queen on g7");
  await expect(queen).toBeVisible();

  const ask = page.getByRole("textbox", { name: "Ask Rook" });
  await ask.fill("why would queen take");
  await ask.press("Enter");
  await expect(bubble).toContainText("Qxg5+ takes my pawn");
  await expect(stepper).toContainText("3 / 3");
  await expect(queen).toBeVisible();
  await expect(page.getByText("Something else")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Show it on the board" }),
  ).toBeVisible();
});

// The player's own words, as typed in the side panel: each gets the reason
// for Rook's capture, never "Did you mean", and the board stays put.
for (const offline of [false, true])
  test(`questions in words about Rook's capture get its reason in place (offline: ${String(offline)})`, async ({
    page,
    context,
  }) => {
    await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
    await expect(
      page.getByRole("heading", { name: /White to move/ }),
    ).toBeVisible({ timeout: 30_000 });
    const bubble = page.locator(".rook-bubble__text");
    const stepper = page.getByRole("group", { name: "Step through the line" });
    const next = page.getByRole("button", { name: "Next step" });
    await page.getByRole("button", { name: "Show me" }).click();
    await next.click();
    await square(page, "White queen on g5").click();
    await square(page, "Empty h6").click();
    await expect(
      page.getByRole("button", { name: "◀ Back to the answer" }),
    ).toBeVisible({ timeout: 30_000 });
    while (!(await bubble.textContent())?.includes("Qxe5")) await next.click();
    if (offline) await context.setOffline(true);
    const at = await stepper.textContent();
    const cells = async () =>
      page
        .locator("[role=gridcell]")
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute("aria-label")).join("|"),
        );
    const board = await cells();
    const ask = page.getByRole("textbox", { name: "Ask Rook" });
    for (const q of [
      "why did you take my pawn",
      "why would the queen take",
      "how come you took that",
      "why Qxe5?",
    ]) {
      await ask.fill(q);
      await ask.press("Enter");
      await page.waitForTimeout(1500);
      const said = await bubble.textContent();
      expect(said).toBe(
        "Nothing defends your pawn on e5, so I take it for free.",
      );
      await expect(page.getByText(/Did you mean/)).toHaveCount(0);
      expect(said).not.toBe("Qxe5 takes your pawn on e5.");
      expect(await stepper.textContent()).toBe(at);
      expect(await cells()).toBe(board);
    }
  });

test("a new question clears the choices left by the last one", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show me" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  const ask = page.getByRole("textbox", { name: "Ask Rook" });
  await ask.fill("why did the queen move");
  await ask.press("Enter");
  const choices = page.getByRole("group", { name: "Which move" });
  await expect(choices).toBeVisible();
  await ask.fill("why");
  await ask.press("Enter");
  await expect(page.locator(".rook-bubble__text")).toHaveText(
    "Kh8 is my only legal move.",
  );
  await expect(choices).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next step" })).toBeEnabled();
});

test("a what-if in words shows the options on the board, then plays the one picked", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show me" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  const ask = page.getByRole("textbox", { name: "Ask Rook" });
  await ask.fill("what if queen moves next to king");
  await ask.press("Enter");
  const bubble = page.locator(".rook-bubble__text");
  await expect(bubble).toContainText("They're drawn on the board.");
  await expect(
    page.locator(".chess-board__square--outline-jade"),
  ).not.toHaveCount(0);
  const options = page.getByRole("group", { name: "Which move" });
  // Qg7# is the line's own move; Qg8+ is the other move beside the king.
  await options.getByRole("button", { name: "What if Qg8+?" }).click();
  await expect(
    page.getByRole("button", { name: "◀ Back to the answer" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("group", { name: "Step through the line" }),
  ).toContainText("1 /");
});

test("once solved, any position on the board can be explored", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#moment/puzzle%3A0HfcA");
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await square(page, "White queen on g4").click();
  await square(page, "Black pawn on g5").click();
  await expect(page.getByRole("button", { name: "Done ✓" })).toBeVisible({
    timeout: 30_000,
  });
  // The solved position, Black to move: the player moves Rook's king.
  await square(page, "Black king on g8").click();
  await square(page, "Empty h8").click();
  await expect(page.locator(".rook-bubble__text")).toContainText("Best move.", {
    timeout: 30_000,
  });
  await expect(
    page.getByRole("group", { name: "Step through the line" }),
  ).toBeVisible();
  // White to move after Kh8: a move the line never made.
  await square(page, "White queen on g5").click();
  await square(page, "Empty h6").click();
  await expect(page.getByRole("button", { name: /◀ Back to the/ })).toBeVisible(
    { timeout: 30_000 },
  );
  await expect(page.locator(".rook-bubble__text")).toContainText("Qh6");
});
