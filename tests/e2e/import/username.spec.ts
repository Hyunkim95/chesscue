import { expect, test } from "@playwright/test";

const pgn = `[Event "Rated blitz"]
[White "Mira"]
[Black "Sam"]
[UTCDate "2026.11.24"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

test.use({ viewport: { width: 320, height: 760 } });

test("imports from Profile into Games and deduplicates on refresh", async ({
  page,
}) => {
  await page.route("https://lichess.org/api/games/user/sam?**", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        id: "abc123XY",
        variant: "standard",
        status: "mate",
        pgn,
      }),
    }),
  );
  await page.goto("/?ui=board-first#profile");
  await page.getByRole("button", { name: "Import from Lichess" }).click();
  const profileUsername = page.getByRole("textbox", {
    name: "Lichess username",
  });
  await expect(profileUsername).toBeFocused();
  await expect(
    page.getByRole("navigation", { name: "Game import sources" }),
  ).toHaveCount(0);
  await profileUsername.fill("Sam");
  await page.getByRole("button", { name: "Import games", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Added 1 game." }),
  ).toBeVisible();
  const imported = page
    .getByRole("list", { name: "Completed games" })
    .getByRole("button", { name: /vs. Mira.*Win/ });
  await expect(imported).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);

  await page.getByRole("button", { name: "Refresh games" }).click();
  await expect(page.getByText("Your games are up to date.")).toBeVisible();
  await expect(imported).toHaveCount(1);
  await expect(imported).toBeEnabled({ timeout: 30_000 });
  await imported.click();
  await expect(page).toHaveURL(/#review\//);
  await expect(
    page.getByRole("heading", { name: /Black to move/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Show me", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask Rook" })).toBeVisible();
  await page.getByRole("button", { name: "Full replay" }).click();
  await expect(
    page.getByRole("heading", { name: "Full replay" }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toHaveCount(0);
  const slider = page.getByRole("slider", { name: "Move through the game" });
  await expect(slider).toBeHidden();
  const advance = page.getByRole("button", { name: "Play game move" });
  await advance.click();
  await expect(page.getByText("f3", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("gridcell", { name: /White pawn on f3/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze next move" }).click();
  const analysisBoard = page.getByRole("grid", { name: "Next move board" });
  await expect(
    analysisBoard.getByRole("gridcell", { name: /White pawn on f3/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to replay" }).click();
  await expect(
    page.getByRole("heading", { name: "Full replay" }),
  ).toBeVisible();
  await expect(page.getByText("f3", { exact: true })).toBeVisible();
  await page.getByText("Jump to position", { exact: true }).click();
  await slider.press("End");
  await expect(advance).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Analyze next move" }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(slider).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("full-replay-desktop.png"),
  });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.getByRole("button", { name: "Back to Review" }).click();
  await expect(
    page.getByRole("button", { name: "Show me", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Games" }).click();
  const savedGame = page
    .getByRole("list", { name: "Completed games" })
    .getByRole("button", { name: /vs. Mira.*Win/ });
  await expect(savedGame).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(savedGame).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("games-desktop.png") });
  await page.setViewportSize({ width: 320, height: 760 });
  await expect(
    page.getByRole("textbox", { name: "Username", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Import PGN", exact: true }).click();
  await expect(page.getByLabel("Paste completed PGN games")).toBeVisible();
});
