import { Chess } from "chess.js";
import { courses } from "../../../src/domain/study/roadmap";
import { squareLabel } from "../../../src/test/generated-position";
import { expect, test } from "@playwright/test";

test("saves a sourced roadmap, then changes and plays a position offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page
    .getByRole("button", { name: "Training plan", exact: true })
    .click({ timeout: 2000 });
  await page.getByRole("button", { name: /Rook endings.*Explore/ }).click();

  await page.getByText("More options", { exact: true }).click();
  await page.getByRole("button", { name: "Open generated roadmap" }).click();
  await expect(
    page.getByRole("link", { name: courses.rook.source }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save for offline study" }).click();
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Training plan", exact: true })
    .click();
  await page.getByRole("button", { name: /Rook endings.*Explore/ }).click();
  await page.getByText("More options", { exact: true }).click();
  await page.getByRole("button", { name: "Open saved Rook endings" }).click();
  await page
    .getByRole("button", { name: "Explore position", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Rook", exact: true }),
  ).toBeVisible();
  const chat = page.getByRole("textbox", { name: "Message Rook" });
  await chat.fill(
    "Set up white king on a2, white rook on h1, white pawn on h2, black king on g7, black rook on d6, black pawn on g5",
  );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("gridcell", { name: "White king on a2" }),
  ).toBeVisible();
  const transcript = page.getByRole("log", { name: "Study conversation" });
  await expect(transcript.getByText(/^Rook ·/)).toBeVisible();
  await expect(
    transcript.getByText("Built-in position commands", { exact: true }),
  ).toBeVisible();
  await chat.fill("Move my king one file closer");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const king = page.getByRole("gridcell", { name: "White king on b2" });
  await expect(king).toBeVisible();
  await king.click();
  await page.getByRole("gridcell", { name: /Empty b3/ }).click();
  await expect(
    page.getByRole("gridcell", { name: /White king on b3/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("gridcell", { name: /White king on b3/ }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Play " + courses.rook.lessons[0].title }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("gridcell", { name: /White king on b3/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(king).toBeVisible();
});

test("opens lessons and position practice inside a skill on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "Primary navigation" });
  const training = menu.getByRole("button", { name: "Training plan" });
  await training.click();
  await page.getByRole("button", { name: /Threats.*Explore/ }).click();
  await expect(
    page.getByRole("heading", { name: "Training plan" }),
  ).toBeVisible();
  const panel = page.locator(".skill-detail");
  await expect(panel.getByRole("grid", { name: /Preview of/ })).toHaveCount(0);
  const play = panel.getByRole("button", {
    name: "Play " + courses.attack.lessons[0].title,
    exact: true,
  });
  await expect(play).toBeVisible();
  await play.click();
  const board = page.getByRole("grid", { name: "Challenge board" });
  const lesson = courses.attack.lessons[0],
    move = new Chess(lesson.fen).move(lesson.continuation[0] ?? "");
  await board.getByRole("gridcell", { name: squareLabel(move.from) }).click();
  await board.getByRole("gridcell", { name: squareLabel(move.to) }).click();
  await expect(
    page.getByRole("region", { name: "Lesson challenge" }).getByRole("status"),
  ).toContainText("Challenge complete");
});

test("opens rook lessons from the plan and returns to its skills", async ({
  page,
}) => {
  await page.goto("/#skill-tree");
  await page.getByRole("button", { name: /Rook endings.*Explore/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Play " + courses.rook.lessons[0].title,
      exact: true,
    }),
  ).toBeVisible();
  const panelBox = await page.locator(".skill-detail").boundingBox();
  expect(panelBox?.height).toBeLessThanOrEqual(480);
  expect(panelBox?.width).toBeLessThanOrEqual(660);

  await expect(
    page.getByRole("heading", { name: "Rook endings", exact: true }).last(),
  ).toBeVisible();
  await expect(
    page.getByText(courses.rook.lessons[0].title, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Study positions", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Your plan", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Play " + courses.rook.lessons[0].title,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("grid", { name: "Challenge board" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Back to challenges/ }).click();
  await page.getByRole("button", { name: /Threats.*Explore/ }).click();
  await expect(
    page.getByRole("heading", {
      name: courses.attack.lessons[0].title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Rook endings", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Piece safety.*Explore/ }).click();
  await page
    .getByRole("button", { name: "Practice this skill", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to training plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Piece safety.*Explore/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("studies the player's recorded moves from imported and rated games offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(page.getByRole("status")).toHaveText("Your move");
  await page.getByRole("gridcell", { name: "White pawn on e2" }).click();
  await page.getByRole("gridcell", { name: "Empty e4" }).click();
  await expect(
    page.getByRole("list", { name: "Move history" }).getByRole("listitem"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Resign game" }).click();
  await expect(page.getByRole("region", { name: "Your Elo" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Import games", exact: true })
    .click();
  await page
    .getByLabel("Paste completed PGN games")
    .fill('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  await page.getByLabel("I played Black").check();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Import games", exact: true })
    .click();
  await expect(page).toHaveURL(/#review\//);
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Training plan", exact: true })
    .click();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /Board vision/ }).click();
  const games = page.getByLabel("Choose a game");
  await expect(games.locator("option:checked")).toContainText("Imported game");
  await expect(
    page.getByRole("heading", { name: "Before 2... Qh4#", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play this position" }).click();
  const board = page.getByRole("grid", { name: "Study board" });
  await expect(board.getByRole("gridcell").first()).toHaveAttribute(
    "aria-label",
    /h1/,
  );
  await board.getByRole("gridcell", { name: "Black queen on d8" }).click();
  await board
    .getByRole("gridcell", { name: /Empty h4, legal destination/ })
    .click();
  await expect(page.getByText("Checkmate", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    board.getByRole("gridcell", { name: /Black queen on h4/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Back to your games/ }).click();
  await games.selectOption({ index: 1 });
  await expect(games.locator("option:checked")).toContainText("Rated game");
  await page.getByRole("button", { name: "Play this position" }).click();
  await page.getByText("What happened in the game?").click();
  await expect(page.getByText("You played e4.", { exact: true })).toBeVisible();
});
