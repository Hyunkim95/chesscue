import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 320, height: 760 } });

test("the game list opens before queued analysis and a review is reusable offline", async ({
  page,
}) => {
  // Hold idle work on the initial visit so both imports remain queued.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("test-enable-import-analysis") !== "true")
      window.requestIdleCallback = () => 1;
  });
  await page.goto("/?ui=board-first#import");
  await page
    .getByLabel("Paste completed PGN games")
    .fill(
      [
        '[White "Maya"]\n[Black "Me"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
        '[White "Sam"]\n[Black "Me"]\n[Result "1/2-1/2"]\n\n1. d4 d5 1/2-1/2',
      ].join("\n\n"),
    );
  await page.getByRole("radio", { name: "I played Black" }).check();
  await page.getByRole("button", { name: "Import games", exact: true }).click();
  await expect(
    page.getByText("2 accepted, 0 duplicate, 0 rejected"),
  ).toBeVisible();

  const unexpectedWorker = page.waitForEvent("worker", { timeout: 1500 });
  const staysIdle = expect(unexpectedWorker).rejects.toThrow(/Timeout/);
  await page.getByRole("button", { name: /Back to (Games|Review)/ }).click();
  const games = page.getByRole("list", { name: "Completed games" });
  await expect(games.getByRole("button")).toHaveCount(2);
  const maya = games.getByRole("button", { name: /vs\. Maya/ });
  // Queued games can be watched before Rook checks them.
  await expect(maya).toContainText("you can watch it");
  await expect(page.getByRole("status")).toHaveText(
    "Checking 2 games on your device",
  );
  await staysIdle;

  await page.evaluate(() => {
    sessionStorage.setItem("test-enable-import-analysis", "true");
  });
  await page.reload();
  await expect(maya).not.toContainText("you can watch it", {
    timeout: 30_000,
  });
  await page.setViewportSize({ width: 420, height: 760 });
  await maya.click();
  await expect(
    page.getByRole("heading", { level: 1, name: /You beat Maya/ }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "Back to Games" }).click();
  await maya.click();
  await expect(
    page.getByRole("heading", { level: 1, name: /You beat Maya/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Games" }).click();
  await page.getByRole("button", { name: "Sky", exact: true }).click();
  const gameSummary = page.getByRole("region", { name: "From your games" });
  const strength = gameSummary.getByRole("button", {
    name: /What went well.*Played in 1 game/,
  });
  await expect(strength).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("sky-games-420.png") });
  await page.setViewportSize({ width: 320, height: 760 });
  await expect(strength).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("sky-games-320.png") });
  await strength.click();
  const evidence = page.getByRole("dialog");
  await expect(evidence.getByText("Played it").first()).toBeVisible();
  await evidence
    .getByRole("button", { name: /Look at moment.*played it/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: /Black to move/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Sky" }).click();
  await expect(strength).toBeVisible();
});
