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

  // Show, don't tell: the reason plays on the board, frame by frame.
  await page.getByRole("button", { name: "Why does it work?" }).click();
  await expect(bubble).toContainText("Qxg5+");
  await expect(page.locator("[data-move-cue-arrow='g5:d2']")).toHaveCount(1);
  await expect(bubble).toHaveText("Qg7# is checkmate.", { timeout: 10_000 });
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

  const sheet = page.getByRole("dialog", { name: "Not this time" });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  const box = await sheet.boundingBox();
  if (!box) throw new Error("The sheet has no box");
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(4);
  expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThan(4);

  // The dimmed backdrop takes clicks meant for the board behind it.
  const queen = await square(page, "White queen").boundingBox();
  if (!queen) throw new Error("The queen has no box");
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.className ?? "",
    [queen.x + queen.width / 2, queen.y + queen.height / 2] as const,
  );
  expect(hit).toContain("ui-sheet__backdrop");

  await sheet.getByRole("button", { name: "Continue" }).click();
  await expect(sheet).toBeHidden();
});
