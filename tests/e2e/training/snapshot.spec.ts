import { expect, test } from "@playwright/test";

test("builds the player snapshot from distinct games and opens each cited position", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/#skill-tree");
  await expect(
    page.getByRole("region", { name: "Curriculum skill tree" }),
  ).toBeVisible({
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
      .getByRole("region", { name: "Practice from your games" })
      .getByRole("button", { name: "Play a game", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Practice from your games" })
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
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Practice", exact: true })
    .click();
  const recommended = page.locator(
    ".practice-tree__node[data-recommended=true]",
  );
  await expect(recommended).toBeVisible({ timeout: 30000 });
  const seen = new Set<string>();
  for (let attempt = 0; attempt < 2; attempt++) {
    await recommended.click();
    const board = page.getByRole("grid");
    const rook = board.getByRole("gridcell", { name: /White rook on [cd]1/ });
    await expect(rook).toBeVisible();
    const file = (await rook.getAttribute("aria-label"))?.match(
      /on ([cd])1/,
    )?.[1];
    if (!file) throw Error("Expected a rook from an imported game.");
    seen.add(file);
    await rook.click();
    await board
      .getByRole("gridcell", { name: new RegExp("Empty " + file + "8") })
      .click();
    await expect(page.getByText("Good move", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Back to Practice", exact: true })
      .click();
  }
  expect(seen).toEqual(new Set(["c", "d"]));
});
