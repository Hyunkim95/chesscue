import { expect, test } from "@playwright/test";

test("uses the same destinations, skill recommendations and Rook review on desktop", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(nav.getByRole("button")).toHaveText([
    "Review",
    "Practice",
    "Play",
    "Social",
  ]);
  await nav.getByRole("button", { name: "Social" }).click();
  await expect(page.getByRole("heading", { name: "Elo races" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Race your friends" }),
  ).toBeVisible();

  await nav.getByRole("button", { name: "Review" }).click();
  const reviewHome = page.getByRole("region", {
    name: "Review your first game",
  });
  await reviewHome.getByRole("button", { name: "Import PGN" }).click();
  await page
    .getByLabel("Paste completed PGN games")
    .fill('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole("radio", { name: "I played White" }).check();
  await page.getByRole("button", { name: "Import games", exact: true }).click();

  const rook = page.getByRole("region", { name: "Explore with Rook" });
  const ask = rook.getByRole("textbox", { name: "Ask Rook" });
  await expect(ask).toBeVisible({ timeout: 20000 });
  const board = rook.getByRole("grid");
  await expect(board).toBeVisible();
  const boardBox = await board.boundingBox();
  const composerBox = await ask.boundingBox();
  if (!boardBox || !composerBox)
    throw new Error("Review board or conversation missing");
  expect(composerBox.x).toBeGreaterThanOrEqual(boardBox.x + boardBox.width);
  await ask.fill("What is the material balance?");
  await rook.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(rook.getByRole("log")).toContainText("Material is level.");
  await page.screenshot({ path: testInfo.outputPath("desktop-review.png") });

  await nav.getByRole("button", { name: "Practice", exact: true }).click();
  const skills = page.getByRole("region", { name: "Curriculum skill tree" });
  await expect(skills).toBeVisible();
  await expect(
    page.getByText("Shared puzzle library", { exact: true }),
  ).toHaveCount(0);
  const forks = skills.getByRole("button", {
    name: "Attack two targets",
    exact: true,
  });
  await forks.click();
  await expect(rook.getByRole("textbox", { name: "Ask Rook" })).toBeVisible();
  await expect(
    rook.getByRole("gridcell", { name: /White knight on g4/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Practice" }).click();
  await expect(forks).toBeFocused();

  await nav.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Rated game", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Guest player", exact: true }),
  ).toBeVisible();
});

test("shows a skeleton of the skill tree and respects reduced motion", async ({
  page,
}, testInfo) => {
  let release: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/PracticeCurriculum-*.js", async (route) => {
    await ready;
    await route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  try {
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    const loader = page
      .getByRole("status")
      .filter({ hasText: "Loading skill tree" });
    await expect(loader).toBeVisible();
    // SLO-014: the wait shows the shape of the coming content, shimmering.
    const block = loader.locator(".skeleton").first();
    await expect(block).toBeVisible();
    await expect(block).toHaveCSS("animation-name", "skeleton-shimmer");
    const bounds = await loader.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(320);
    await page.screenshot({ path: testInfo.outputPath("desktop-loading.png") });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(block).toHaveCSS("animation-name", "none");
    await expect(loader).toBeVisible();
  } finally {
    release();
  }
  await expect(
    page.getByRole("region", { name: "Curriculum skill tree" }),
  ).toBeVisible();
});
