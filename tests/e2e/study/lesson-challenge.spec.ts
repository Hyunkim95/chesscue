import { Chess } from "chess.js";
import { expect, test, type Locator } from "@playwright/test";
import { courses } from "../../../src/domain/study/roadmap";
import { squareLabel } from "../../../src/test/generated-position";

async function play(board: Locator, uci: string) {
  await board
    .getByRole("gridcell", { name: squareLabel(uci.slice(0, 2)) })
    .click();
  await board
    .getByRole("gridcell", { name: squareLabel(uci.slice(2, 4)) })
    .click();
}
test("plays the installed generated lessons offline, including retry, recorded replies, reload and return", async ({
  page,
  context,
}) => {
  await page.goto("/#study/rook");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  const lessons = courses.rook.lessons,
    first = lessons[0],
    open = page.getByRole("button", {
      name: "Play " + first.title,
      exact: true,
    });
  const challenge = page.getByRole("region", { name: "Lesson challenge" }),
    board = challenge.getByRole("grid", { name: "Challenge board" });
  await open.click();
  await expect(
    challenge.getByRole("button", { name: "Explore with Rook" }),
  ).toHaveCount(0);
  const original = new Chess(first.fen),
    wrong = original
      .moves({ verbose: true })
      .find((m) => m.san !== first.continuation[0]);
  if (!wrong)
    throw Error("Expected an alternative for the historical reconstruction");
  await play(board, wrong.lan);
  await expect(challenge.getByRole("status")).toContainText("Try again");
  await challenge.getByRole("button", { name: "Explore with Rook" }).click();
  const exploration = page.getByRole("region", { name: "Explore with Rook" });
  await expect(exploration.getByRole("grid")).toBeVisible();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Back to challenge" })
    .click();
  await expect(challenge.getByRole("status")).toContainText("Try again");
  await challenge
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  for (const [i, lesson] of lessons.entries()) {
    await expect(
      challenge.getByRole("heading", { name: lesson.title, exact: true }),
    ).toBeVisible();
    const game = new Chess(lesson.fen);
    for (const [offset, san] of lesson.continuation.entries()) {
      const move = game.move(san);
      if (offset % 2 === 0) await play(board, move.lan);
      else
        await expect(
          board.getByRole("gridcell", {
            name: new RegExp(move.to + ", last move ended here"),
          }),
        ).toBeVisible();
    }
    await expect(challenge.getByRole("status")).toContainText(
      "Challenge complete",
    );
    await challenge
      .getByRole("button", {
        name: i + 1 < lessons.length ? "Next challenge" : "Finish lessons",
        exact: i + 1 === lessons.length,
      })
      .click();
  }
  await expect(open).toBeVisible();
  await open.click();
  await play(board, new Chess(first.fen).move(first.continuation[0] ?? "").lan);
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Back to challenges" })
    .click();
  await open.click();
  await expect(challenge.getByRole("status")).toContainText("Your move");
  await page.reload();
  await expect(challenge.getByRole("status")).toContainText("Your move");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Back to challenges" })
    .click();
  await expect(open).toBeVisible();
});
