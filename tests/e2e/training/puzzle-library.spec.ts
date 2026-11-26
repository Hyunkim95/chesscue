import { expect, test } from "@playwright/test";
import { squareLabel } from "../../../src/test/generated-position";
import expansion from "../../../scripts/material/library-expansion.generated.json" with { type: "json" };
import seed from "../../../scripts/material/library-seed.generated.json" with { type: "json" };

for (const { viewport, release } of [
  { viewport: { width: 1280, height: 900 }, release: seed },
  { viewport: { width: 390, height: 844 }, release: expansion },
]) {
  test(`solves an installed shared puzzle offline at ${String(viewport.width)}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(async () =>
      navigator.serviceWorker.ready.then(() => undefined),
    );
    await context.setOffline(true);
    await page.reload();
    await page
      .getByRole("button", { name: "Training plan", exact: true })
      .click();
    await page.getByText("Shared puzzle library", { exact: true }).click();
    for (const catalog of [seed, expansion]) {
      for (const motif of catalog.motifs) {
        await page
          .getByRole("button", { name: motif.name, exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: /Open puzzle/ }),
        ).toHaveCount(6);
      }
    }

    const motif = release.motifs[0];
    const course = release.curricula[0];
    const puzzle = release.puzzles.find(
      ({ id }) => id === course?.puzzleIds[0],
    );
    const move = puzzle?.acceptableMoves[0];
    if (!motif || !course || !move) throw new Error("Missing starter puzzle");
    await page.getByRole("button", { name: motif.name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: course.title }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Open puzzle/ })).toHaveCount(
      course.puzzleIds.length,
    );
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);

    await page
      .getByRole("button", { name: /Open puzzle/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Find the first move" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Source game" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Explore with Rook" }),
    ).toHaveCount(0);
    await page
      .getByRole("gridcell", { name: squareLabel(move.slice(0, 2)) })
      .click();
    await page
      .getByRole("gridcell", { name: squareLabel(move.slice(2, 4)) })
      .click();
    await expect(
      page.getByRole("heading", { name: /^You played/ }),
    ).toBeVisible();
    await expect(page.getByText("Good move", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Explore with Rook" }).click();
    const exploration = page.getByRole("region", { name: "Explore with Rook" });
    await expect(exploration.getByRole("grid")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: test.info().outputPath("rook-exploration.png"),
    });
    await exploration
      .getByRole("button", { name: "Close exploration" })
      .click();
    await expect(page.getByText("Good move", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to training plan" }).click();
    await expect(
      page.getByRole("heading", { name: course.title }),
    ).toBeVisible();
  });
}
