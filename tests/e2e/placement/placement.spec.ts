import { expect, test } from "@playwright/test";

test("places a new player after five completed rated games and carries beginner difficulty forward", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  for (let game = 1; game <= 5; game++) {
    await expect(
      page.getByText("Placement game " + String(game) + " of 5", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Beginner CPU", { exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Your move");
    await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
    await page.getByRole("gridcell", { name: "Empty e4" }).click();
    await expect(
      page.getByRole("list", { name: "Move history" }).getByRole("listitem"),
    ).toHaveCount(2);
    if (game === 3) {
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });
      await context.setOffline(true);
      await page.reload();
      await expect(
        page.getByText("Placement game 3 of 5", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Move history" }).getByRole("listitem"),
      ).toHaveCount(2);
    }
    await page.getByRole("button", { name: "Resign game" }).click();
    const rating = page.getByRole("region", { name: "Your Elo" });
    if (game < 5) {
      await expect(rating).toContainText(
        "Placement · " + String(game) + " of 5",
      );
      await expect(rating.getByRole("img")).toHaveCount(0);
      if (game === 4) {
        await page.getByRole("button", { name: "View rank path" }).click();
        await expect(
          page.getByRole("heading", { name: "Unranked" }),
        ).toBeVisible();
        await expect(
          page
            .getByRole("group", { name: "Rank tiers" })
            .getByRole("button", { pressed: true }),
        ).toHaveCount(0);
        await page.getByRole("button", { name: "Play a rated game" }).click();
      } else
        await page
          .getByRole("button", { name: "Play next placement game" })
          .click();
    } else {
      await expect(
        rating.getByRole("heading", { name: "You placed in Copper" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "View rank path" }).click();
      await expect(
        page.getByRole("heading", { name: "Copper", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Play a rated game" }).click();
      await expect(
        page.getByText("Beginner CPU", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/Placement game/)).toHaveCount(0);
    }
  }
});
