import { expect, test } from "@playwright/test";

test("builds the player snapshot from distinct games and opens each cited position", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/#skill-tree");
  await expect(page.getByRole("group", { name: "Chess skills" })).toBeVisible({
    timeout: 3000,
  });
  await expect(
    page.getByText(
      "Play or import a completed game to get your first recommendation.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Next to train", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Play this focus game" }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("main")
      .getByRole("button", { name: "Play a game", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Import games", exact: true })
    .click();
  const pgn = (file: string, move: number, row: string) =>
    `[Event "Snapshot ${file}"]\n[SetUp "1"]\n[FEN "6k1/p4ppp/8/8/8/8/5PPP/${row} w - - 0 ${String(move)}"]\n[Result "1-0"]\n\n${String(move)}. R${file}2 a6 ${String(move + 1)}. R${file}8# 1-0`;
  await page
    .getByLabel("Paste completed PGN games")
    .fill([pgn("d", 28, "3R2K1"), pgn("c", 36, "2R3K1")].join("\n\n"));
  await page.getByRole("radio", { name: "I played White" }).check();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Import games", exact: true })
    .click();
  await expect(
    page.getByText("2 accepted, 0 duplicate, 0 rejected"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Training plan", exact: true })
    .click();
  await expect(
    page.getByText(
      /In 2 of your games, Stockfish found a stronger move involving one-move threats/,
    ),
  ).toBeVisible({ timeout: 30000 });
  const snap = page.getByRole("region", { name: "Moves from your games" });
  const pattern = snap.getByText("One-move threats · 2 moves across 2 games", {
    exact: true,
  });
  await expect(pattern).toBeVisible({ timeout: 30000 });
  await expect(
    snap.getByRole("button", { name: "Replay 28. Rd2" }),
  ).toBeHidden();
  await page
    .getByRole("button", {
      name: /Piece safety.*(?:Explore|Practice ready|In progress)/,
    })
    .click();
  await expect(pattern).toBeHidden();
  await page.getByRole("button", { name: /Threats.*From your game/ }).click();
  for (const [move, from] of [
    ["28. Rd2", "d1"],
    ["36. Rc2", "c1"],
  ] as const) {
    await pattern.click();
    await snap
      .getByRole("button", { name: "Replay " + move, exact: true })
      .click();
    await expect(
      page.getByRole("gridcell", { name: "White rook on " + from }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Back to training plan" }).click();
  }
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Your training profile" }),
  ).toContainText("Evidence from 2 imported games and 0 tutor games.", {
    timeout: 2500,
  });
});
