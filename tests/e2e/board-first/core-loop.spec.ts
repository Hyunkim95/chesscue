import { expect, test, type Page } from "@playwright/test";

// Phase 1 acceptance (docs/design/board-first-redesign.md §8): Today → Play it
// → not-best move → Try again with ghost arrows → solve → Done → celebration
// → recap → Sky. A new player starts from the warm-up position.

const square = (page: Page, name: string) =>
  page.locator(`[role=gridcell][aria-label^="${name}"]`).first();

test.use({ viewport: { width: 360, height: 800 } });

test("a new player finds the warm-up idea on a retry and sees it recapped", async ({
  page,
}) => {
  await page.goto("/?ui=board-first");
  await expect(
    page.getByRole("heading", { name: "Warm-up position" }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Try the warm-up" }).click();
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({
    timeout: 30_000,
  });
  // Focus mode: the tabs hide and only ✕ remains.
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Leave this position" }),
  ).toBeVisible();

  // A not-best move: Rook answers on the board and names the tier.
  await square(page, "White rook on f1").click();
  await square(page, "Empty f2").click();
  const bubble = page.locator(".rook-bubble__text");
  await expect(bubble).toContainText("Something much stronger was here", {
    timeout: 30_000,
  });
  await expect(page.getByRole("list", { name: "Your tries" })).toContainText(
    "Rf2",
  );
  // Chips never name the answer before it is found.
  await expect(page.getByRole("group", { name: "Ask Rook" })).not.toContainText(
    "Qxg5",
  );

  await page.getByRole("button", { name: "↺ Try again" }).click();
  await expect(page.locator("[data-move-cue-arrow='f1:f2']")).toHaveCount(1);

  await square(page, "White queen on g4").click();
  await square(page, "Black pawn on g5").click();
  await expect(page.getByRole("button", { name: "Done ✓" })).toBeVisible({
    timeout: 30_000,
  });
  // Kh8 is Rook's only legal reply, so there is no other defence to ask about.
  await expect(
    page.getByRole("button", { name: /What if you'd played/ }),
  ).toHaveCount(0);

  // Show, don't tell: the player steps through the reason on the board.
  await page.getByRole("button", { name: "Why does it work?" }).click();
  await expect(bubble).toContainText("Qxg5+");
  await expect(page.locator("[data-move-cue-arrow='g5:d2']")).toHaveCount(1);
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(bubble).toHaveText("Qg7# is checkmate.");
  await page.getByRole("button", { name: "↺ Reset" }).click();
  await expect(square(page, "White queen on g4")).toBeVisible();

  await page.getByRole("button", { name: "Done ✓" }).click();
  const sheet = page.getByRole("dialog", { name: "Found it on a retry" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("+");
  await sheet.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "From your games today" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /See your sky/ }).click();
  await expect(page.getByRole("heading", { name: "Your sky" })).toBeVisible();
});

test("a refreshed moment reopens the same position and a bare #moment goes to Today", async ({
  page,
}) => {
  await page.goto("/?ui=board-first");
  await page.getByRole("button", { name: "Try the warm-up" }).click();
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/#moment\/puzzle%3A/);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(square(page, "White queen on g4")).toBeVisible();

  await page.goto("/?ui=board-first#moment");
  await expect(
    page.getByRole("heading", { name: "Warm-up position" }),
  ).toBeVisible({
    timeout: 20_000,
  });
});

test("the new tab bar never covers the play board on a wide screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?ui=board-first#play");
  for (const name of [
    "White pawn on e2",
    "White knight on g1",
    "White rook on h1",
  ]) {
    const cell = square(page, name);
    await expect(cell).toBeVisible({ timeout: 20_000 });
    const box = await cell.boundingBox();
    if (!box) throw new Error(`${name} has no box`);
    const hit = await page.evaluate(
      ([x, y]) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[role=gridcell]")
          ?.getAttribute("aria-label") ?? "",
      [box.x + box.width / 2, box.y + box.height / 2] as const,
    );
    expect(hit).toContain(name);
  }
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Today" }),
  ).toBeVisible();
});

test("on a wide screen the Not this time sheet is a centred modal over the board", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/?ui=board-first");
  await page.getByRole("button", { name: "Try the warm-up" }).click();
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show me" }).click();

  // The answer plays out and the player can still ask about it.
  await expect(
    page.getByRole("button", { name: "Why does it work?" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask Rook" })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Not this time" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Done ✓" }).click();

  const sheet = page.getByRole("dialog", { name: "Not this time" });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  // The sheet rises and scales in; measure it once it has settled.
  await sheet.evaluate((element) =>
    Promise.all(element.getAnimations().map(({ finished }) => finished)),
  );
  const box = await sheet.boundingBox();
  if (!box) throw new Error("The sheet has no box");
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(4);
  expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThan(4);

  // The dimmed backdrop takes clicks meant for the board behind it.
  const corner = await square(page, "Black rook on a8").boundingBox();
  if (!corner) throw new Error("The rook has no box");
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.className ?? "",
    [corner.x + corner.width / 2, corner.y + corner.height / 2] as const,
  );
  expect(hit).toContain("ui-sheet__backdrop");

  await sheet.getByRole("button", { name: "Continue" }).click();
  await expect(sheet).toBeHidden();
});

test("returning to Today from another tab shows it at once, without reloading", async ({
  page,
}) => {
  await page.goto("/?ui=board-first");
  await expect(
    page.getByRole("heading", { name: "Warm-up position" }),
  ).toBeVisible({ timeout: 20_000 });
  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await nav.getByRole("button", { name: "Play" }).click();
  await expect(page).toHaveURL(/#play/);
  await page.evaluate(() => {
    const seen = { loading: false };
    Object.assign(window, { todaySeen: seen });
    new MutationObserver(() => {
      if (document.querySelector(".today__card--skeleton")) seen.loading = true;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await nav.getByRole("button", { name: /^Today/ }).click();
  await expect(
    page.getByRole("heading", { name: "Warm-up position" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { todaySeen: { loading: boolean } }).todaySeen
          .loading,
    ),
  ).toBe(false);
});

test("after a missed warm-up, Today offers an honest practice puzzle whose line ends with the payoff", async ({
  page,
}) => {
  await page.goto("/?ui=board-first");
  await page.getByRole("button", { name: "Try the warm-up" }).click();
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show me" }).click();
  await page.getByRole("button", { name: "Done ✓" }).click({ timeout: 20_000 });
  await page
    .getByRole("dialog", { name: "Not this time" })
    .getByRole("button", { name: "Continue" })
    .click();
  await page.goto("/?ui=board-first#today");

  const today = page.locator(".today");
  await expect(today).toContainText("Practice puzzle", { timeout: 20_000 });
  await expect(today).toContainText("Same idea as one you missed.");
  await expect(today).not.toContainText("from your game");
  await expect(today).toContainText("One move here wins material.");

  await page.getByRole("button", { name: "Play it" }).click();
  await expect(
    page.getByRole("heading", { name: /White to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Show me" }).click();
  // The payoff is the line's last step.
  const next = page.getByRole("button", { name: "Next step" });
  while (await next.isEnabled()) await next.click();
  await expect(page.locator(".rook-bubble").first()).toContainText(
    "You've won",
  );
  // The squares where material was won are outlined.
  await expect(
    page.locator(".chess-board__square--outline-jade").first(),
  ).toBeVisible();
});

test("a star's sheet closes in a narrow panel, above the tab bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 380, height: 800 });
  await page.goto("/?ui=board-first#sky");
  await page.getByRole("button", { name: /Read the board/ }).click();
  const sheet = page.getByRole("dialog", { name: "Read the board" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
});
