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
  // The game plays as one replay that is also its report.
  await expect(
    page.getByRole("heading", { level: 1, name: /You beat Mira/ }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Move 2: a chance you took" })
    .click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Keep watching" }).click();
  await page.getByRole("button", { name: "Watch again" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Analyze this position" }).click();
  const analysisBoard = page.getByRole("grid", { name: "Next move board" });
  await expect(
    analysisBoard.getByRole("gridcell", { name: /White pawn on f2/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to replay" }).click();
  // It comes back paused where it was left.
  await expect(
    page.getByRole("button", { name: "Analyze this position" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: test.info().outputPath("watch-desktop.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 320, height: 760 });
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
