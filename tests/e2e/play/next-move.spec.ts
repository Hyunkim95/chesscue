import { expect, test, type Page } from "@playwright/test";

// The next-move tool (docs/design/chessigma-parity.md, increment 1): open it
// from Play, read Stockfish's best move, paste a FEN, play a move and hear
// what it does, step through lines, stop a search and promote a pawn.

const square = (page: Page, name: string) =>
  page.locator(`[role=gridcell][aria-label^="${name}"]`).first();

// 1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4: taking on e5 walks into Qg5.
const TRAP = "r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
const SEARCH = { timeout: 60_000 };

async function setPosition(page: Page, fen: string) {
  await page.getByRole("button", { name: "Set position" }).click();
  await page.getByLabel("Paste a FEN").fill(fen);
  await page.getByRole("button", { name: "Analyse this position" }).click();
}

test.use({ viewport: { width: 320, height: 720 } });

test("Play opens the next-move tool, which finds and explains moves", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#play-mode");
  await page.getByRole("button", { name: "Next move" }).click();
  await expect(
    page.getByRole("heading", { name: "Next move", level: 1 }),
  ).toBeVisible();
  const best = page.getByRole("region", { name: "Best move" });
  await expect(page.getByText("Depth 18", { exact: true })).toBeVisible(SEARCH);
  await expect(best).toContainText(/BEST MOVE(e4|d4|Nf3|c4)[+−]?\d\.\d/);
  await expect(
    page.getByRole("list", { name: "Stockfish lines" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);

  // A FEN that cannot be a position is explained, not searched.
  await page.getByRole("button", { name: "Set position" }).click();
  await page
    .getByLabel("Paste a FEN")
    .fill(TRAP.replace("RNBQK2R", "RNBQKK1R"));
  await expect(
    page.getByText("White has two kings. Check the FEN and paste it again."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analyse this position" }),
  ).toBeDisabled();
  await page.getByLabel("Paste a FEN").fill(TRAP);
  await page.getByRole("button", { name: "Analyse this position" }).click();
  await expect(best).toContainText("Nxd4", SEARCH);
  await expect(page.getByText("Depth 18", { exact: true })).toBeVisible(SEARCH);

  // Taking on e5: Rook answers with Stockfish's reply and names the best move.
  await square(page, "White knight on f3").click();
  await square(page, "Black pawn on e5").click();
  await expect(
    page.getByText(/Nxe5 takes my pawn, but I answer Qg5/),
  ).toBeVisible(SEARCH);
  await expect(page.getByText(/→ −0\.\d · Nxd4 was best$/)).toBeVisible();
  await expect(best).toContainText("Qg5");

  // Back, forward and Reset step through what was played.
  await page.getByRole("button", { name: "Back one move" }).click();
  await expect(square(page, "White knight on f3")).toBeVisible();
  await page.getByRole("button", { name: "Forward one move" }).click();
  await expect(square(page, "White knight on e5")).toBeVisible();
  await page.getByRole("button", { name: "↺ Reset" }).click();
  await expect(square(page, "White knight on f3")).toBeVisible();
  await expect(page.getByText(/Nxe5 takes my pawn/)).toHaveCount(0);

  // Tapping a move in a line plays the line up to it.
  await expect(page.getByText("Depth 18", { exact: true })).toBeVisible(SEARCH);
  await page.getByRole("button", { name: "Play line 1 up to exd4" }).click();
  await expect(square(page, "Black pawn on d4")).toBeVisible();

  // Go deeper can be stopped, and the deepest lines so far stay.
  await expect(page.getByRole("button", { name: "Go deeper" })).toBeVisible(
    SEARCH,
  );
  await page.getByRole("button", { name: "Go deeper" }).click();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Go deeper" })).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Stockfish lines" }),
  ).toBeVisible();
});

test("a pawn can promote to any piece, and ✕ goes back to Play", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#next-move");
  await expect(
    page.getByRole("heading", { name: "Next move", level: 1 }),
  ).toBeVisible();
  await setPosition(page, "8/P7/8/8/8/8/k7/4K3 w - - 0 1");
  await square(page, "White pawn on a7").click();
  await square(page, "Empty a8").click();
  await page.getByRole("button", { name: "Promote to knight" }).click();
  await expect(square(page, "White knight on a8")).toBeVisible();

  await page.getByRole("button", { name: "Back to Play" }).click();
  await expect(page.getByRole("button", { name: "Next move" })).toBeVisible();
});

test("pieces can be set up by hand, and an impossible setup is refused", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#next-move");
  await page.getByRole("button", { name: "Set position" }).click();
  await page.getByRole("button", { name: "Set up pieces" }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("White has no king.")).toBeVisible();

  await page.getByRole("radio", { name: "White king" }).click();
  await square(page, "Empty e1").click();
  await page.getByRole("radio", { name: "Black king" }).click();
  await square(page, "Empty e8").click();
  await page.getByRole("radio", { name: "White queen" }).click();
  await square(page, "Empty d1").click();
  await page.getByRole("button", { name: "Analyse this position" }).click();

  await expect(square(page, "White queen on d1")).toBeVisible();
  await expect(page.getByRole("region", { name: "Best move" })).toContainText(
    /BEST MOVE/,
    SEARCH,
  );
  await expect(page.getByText(/Depth \d+/)).toBeVisible(SEARCH);
});

test("the Stockfish bar is vertical, and wide screens keep the left rail", async ({
  page,
}) => {
  await page.goto("/?ui=board-first#next-move");
  const bar = page.getByRole("img", { name: /^Stockfish: / });
  await expect(bar).toBeVisible(SEARCH);
  const narrow = await bar.boundingBox();
  if (!narrow) throw new Error("No Stockfish bar");
  expect(narrow.height).toBeGreaterThan(narrow.width * 10);
  // Focus mode in the side panel: only ✕.
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeHidden();

  await page.setViewportSize({ width: 1280, height: 860 });
  const rail = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(rail).toBeVisible();
  const wide = await bar.boundingBox();
  if (!wide) throw new Error("No Stockfish bar");
  expect(wide.height).toBeGreaterThan(wide.width * 10);
  await rail.getByRole("button", { name: "Play" }).click();
  await expect(page.getByRole("button", { name: "Next move" })).toBeVisible();
});
