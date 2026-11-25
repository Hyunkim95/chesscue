import { expect, test } from "@playwright/test";

test("opens an imported position offline from the training plan", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.getByRole("button", { name: "Bring games" }).click();
  await page
    .getByLabel("Paste completed PGN games")
    .fill('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByRole("radio", { name: "I played Black" }).check();
  await page.getByRole("button", { name: "Import games" }).click();
  await expect(
    page.getByText("1 accepted, 0 duplicate, 0 rejected"),
  ).toBeVisible();
  await page.reload();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Training plan" }).click();
  await page.getByRole("button", { name: "Open study board" }).click();
  await expect(
    page.getByLabel("Choose a game").locator("option:checked"),
  ).toContainText("Imported game");
  await page.getByRole("button", { name: "Play this position" }).click();
  const board = page.getByRole("grid", { name: "Study board" });
  await board.getByRole("gridcell", { name: "Black queen on d8" }).click();
  await board
    .getByRole("gridcell", { name: /Empty h4, legal destination/ })
    .click();
  await expect(page.getByText("Checkmate", { exact: true })).toBeVisible();
});
