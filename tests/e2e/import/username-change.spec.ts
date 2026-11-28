import { expect, test, type Page } from "@playwright/test";

const pgn = `[Event "Rated blitz"]
[White "Mira"]
[Black "Sam"]
[UTCDate "2026.11.24"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

test.use({ viewport: { width: 320, height: 760 } });

async function openGamesWithSavedNames(page: Page) {
  await page.goto("/?ui=board-first");
  await page.evaluate(() => {
    localStorage.setItem(
      "username-imports",
      JSON.stringify({ lichess: "magnus_fan", chesscom: "pawnstorm" }),
    );
  });
  await page.reload();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Games" })
    .click();
}

test("changes a saved Lichess name and imports under the new one", async ({
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
  await openGamesWithSavedNames(page);

  const lichess = page.getByRole("group", { name: "Lichess" });
  await expect(lichess.getByText("magnus_fan")).toBeVisible();
  await expect(
    lichess.getByRole("button", { name: "Refresh Lichess games" }),
  ).toBeVisible();
  await lichess.getByRole("button", { name: "Change Lichess name" }).click();

  const field = lichess.getByRole("textbox", { name: "Lichess username" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("magnus_fan");
  await field.fill("Sam");
  await lichess.getByRole("button", { name: "Import games" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Added 1 game." }),
  ).toBeVisible();
  await expect(lichess.getByText("Sam", { exact: true })).toBeVisible();
  await expect(field).toHaveCount(0);
  // The other site keeps its own name.
  await expect(
    page.getByRole("group", { name: "Chess.com" }).getByText("pawnstorm"),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test("cancels a change and forgets a saved name", async ({ page }) => {
  await openGamesWithSavedNames(page);
  const lichess = page.getByRole("group", { name: "Lichess" });

  await lichess.getByRole("button", { name: "Change Lichess name" }).click();
  await lichess.getByRole("textbox", { name: "Lichess username" }).fill("x");
  await lichess.getByRole("button", { name: "Cancel" }).click();
  await expect(lichess.getByText("magnus_fan")).toBeVisible();

  await lichess.getByRole("button", { name: "Change Lichess name" }).click();
  await lichess.getByRole("button", { name: "Forget magnus_fan" }).click();
  await expect(page.getByText("magnus_fan")).toHaveCount(0);
  await expect(
    lichess.getByRole("button", { name: "Add Lichess name" }),
  ).toBeFocused();

  await page.reload();
  await expect(page.getByText("magnus_fan")).toHaveCount(0);
  await expect(page.getByText("pawnstorm")).toBeVisible();
});
