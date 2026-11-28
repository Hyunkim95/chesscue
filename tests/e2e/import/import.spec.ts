import { expect, test } from "@playwright/test";

const foolsMate = `[Event "Imported training game"]
[Site "Local"]
[Date "2026.11.24"]
[Round "1"]
[White "Player"]
[Black "Opponent"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

test("reopens a saved review, offers the other side, and links duplicates in a batch", async ({
  page,
}) => {
  const openImport = async () => {
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Review", exact: true })
      .click();
    await page.getByRole("button", { name: "Import PGN", exact: true }).click();
  };
  const submit = async (side: "White" | "Black", pgn = foolsMate) => {
    await page.getByLabel("Paste completed PGN games").fill(pgn);
    await page.getByRole("radio", { name: "I played " + side }).check();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Import games", exact: true })
      .click();
  };
  const rook = page.getByRole("region", { name: "Explore with Rook" });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await openImport();
  await submit("White");
  await expect(rook.getByLabel("Ask Rook")).toBeVisible({ timeout: 30_000 });
  const original = page.url();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await openImport();
  const annotated = foolsMate.replace(
    "f3 e5",
    "f3 { [%clk 0:03:00] } { Opening note } e5",
  );
  await submit("White", annotated);
  await expect(page).toHaveURL(original);
  await expect(page.getByText("Opened your saved review.")).toBeVisible();
  await expect(rook.getByLabel("Ask Rook")).toBeVisible();

  await openImport();
  await submit("Black");
  await expect(
    page.getByText("Which side would you like to review?"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open saved White review" }).click();
  await expect(page).toHaveURL(original);

  await openImport();
  await submit("Black");
  await page.getByRole("button", { name: "Analyze Black moves" }).click();
  await expect(page).toHaveURL(original + "/black");
  await expect(rook.getByLabel("Ask Rook")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Reviewing Black’s moves.")).toBeVisible();
  await expect(
    rook.getByRole("grid", { name: "Training board, Black side" }),
  ).toBeVisible();
  await expect(
    rook
      .getByRole("group", { name: "Board playback" })
      .getByText("Black to move"),
  ).toBeVisible();

  await openImport();
  await submit("White", foolsMate + "\n\n" + foolsMate);
  await expect(
    page.getByRole("heading", { name: "0 accepted, 2 duplicate, 0 rejected" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open review", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(original);
});

test("learner-color controls stay accessible on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Review", exact: true })
    .click();
  await page.getByRole("button", { name: "Import PGN", exact: true }).click();

  const group = page.getByRole("group", {
    name: "Which side did you play in these games?",
  });
  await expect(
    page.getByText(/including player names, comments and variations/),
  ).toBeVisible();
  await expect(group).toBeVisible();
  await expect(
    group.getByRole("radio", { name: "I played White" }),
  ).toBeVisible();
  await expect(
    group.getByRole("radio", { name: "I played Black" }),
  ).toBeVisible();
  await expect(
    page.getByText("Import mixed-color games in separate batches."),
  ).toBeVisible();
});

test("opens the desktop Practice skill tree", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Practice", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Skill tree", exact: true }),
  ).toBeVisible();
  const tree = page.getByRole("region", { name: "Curriculum skill tree" });
  await expect(tree.getByRole("heading", { level: 2 })).toHaveText([
    "Play safely",
    "Create and answer threats",
    "Calculate and convert",
    "Make a plan",
  ]);
  await expect(
    page.getByRole("region", { name: "Practice from your games" }),
  ).toBeVisible();
});
