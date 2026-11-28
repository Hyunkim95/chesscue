import { expect, test } from "@playwright/test";
import { squareLabel } from "../../../src/test/generated-position";
import expansion from "../../../scripts/material/library-expansion.generated.json" with { type: "json" };
import seed from "../../../scripts/material/library-seed.generated.json" with { type: "json" };

for (const { viewport, release, skill, cue } of [
  {
    viewport: { width: 1280, height: 900 },
    release: seed,
    skill: "Attack two targets",
    cue: "Find a move or preparation that attacks two targets.",
  },
  {
    viewport: { width: 390, height: 844 },
    release: expansion,
    skill: "Race a passed pawn",
    cue: "Count promotion moves and account for the opponent’s checks and king route.",
  },
]) {
  test(`recommends and solves an installed shared puzzle offline at ${String(viewport.width)}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("button", { name: "Practice", exact: true }).click();
    const motif = release.motifs[0];
    const puzzles = release.puzzles
      .filter((puzzle) => puzzle.motifId === motif?.id)
      .toSorted((left, right) => left.rating - right.rating);
    const [puzzle, next] = puzzles;
    const move = puzzle?.acceptableMoves[0];
    if (!puzzle || !next || !move) throw new Error("Missing installed puzzles");

    const node = page.getByRole("button", { name: skill, exact: true });
    await node.click();
    const rook = page.getByRole("region", { name: "Explore with Rook" });
    await expect(page).toHaveURL(
      new RegExp("#practice/archive-library-" + puzzle.id + "$"),
    );
    const guidance = rook.getByRole("status", { name: "Rook’s guidance" });
    await expect(guidance).toContainText(cue);
    await expect(guidance).toBeInViewport({ ratio: 1 });
    await rook.getByText("Sources", { exact: true }).click();
    await expect(rook.getByRole("link", { name: "Source game" })).toBeVisible();
    await rook
      .getByRole("gridcell", { name: squareLabel(move.slice(0, 2)) })
      .click();
    await rook
      .getByRole("gridcell", { name: squareLabel(move.slice(2, 4)) })
      .click();
    await expect(page.getByText("Good move", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: test.info().outputPath("rook-exploration.png"),
    });
    await page.getByRole("button", { name: "Back to Practice" }).click();
    await node.click();
    await expect(page).toHaveURL(
      new RegExp("#practice/archive-library-" + next.id + "$"),
    );
  });
}
