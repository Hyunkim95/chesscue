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

  // A typed question on a frame, offline with no on-device model: Rook says
  // so and the board stays on the frame. Routing and the answer on the frame
  // are covered by MomentScreen.test.tsx, since no model runs here.
  await context.setOffline(true);
  const ask = page.getByRole("textbox", { name: "Ask Rook" });
  await ask.fill("why Kh8?");
  await ask.press("Enter");
  await expect(bubble).toHaveText("I didn't catch that. Tap a chip instead.", {
    timeout: 20_000,
  });
  await expect(stepper).toContainText("2 / 3");
  await expect(square(page, "Black king on h8")).toBeVisible();
  await next.click();
  await expect(bubble).toHaveText("Qg7# is checkmate.");
});
