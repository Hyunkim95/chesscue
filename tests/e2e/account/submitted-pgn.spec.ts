/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

test("a guest's offline batch becomes replayable shared games and a verified puzzle", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  test.skip(baseURL !== "http://127.0.0.1:4187", "Requires Firebase emulators");
  test.setTimeout(120_000);
  const project = "demo-chesscue-account";
  const documents =
    "http://127.0.0.1:8080/v1/projects/" +
    project +
    "/databases/(default)/documents/";
  const pgn =
    '[Event "Shared source"]\n[White "White player"]\n[Black "Black player"]\n[Result "0-1"]\n\n1. f3 {original note} (1. d4 d5) e5 2. g4 Qh4# 0-1';
  const quiet = '[Event "Quiet game"]\n[Result "1/2-1/2"]\n\n1. d4 d5 1/2-1/2';
  const invalid = '[Event "Unfinished"]\n[Result "*"]\n\n1. d4 *';
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  await page.goto("/");
  await page.getByRole("button", { name: "Import games", exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page
    .getByLabel("Paste completed PGN games")
    .fill([pgn, quiet, pgn, invalid].join("\n\n"));
  await page.getByRole("radio", { name: "I played White" }).check();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Import games", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "2 accepted, 1 duplicate, 1 rejected" }),
  ).toBeVisible();
  await page.reload();
  await context.setOffline(false);
  const status = async (path: string) =>
    (
      await fetch(documents + path, {
        headers: { authorization: "Bearer owner" },
      })
    ).status;
  for (const score of [pgn, quiet]) {
    await expect
      .poll(() => status("pgnSubmissions/" + sha(score)), { timeout: 45000 })
      .toBe(200);
  }
  expect(await status("pgnSubmissions/" + sha(invalid))).toBe(404);
  execFileSync(process.execPath, ["scripts/material/mine-submissions.mjs"], {
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      LIBRARY_FIREBASE_PROJECT: project,
      LIBRARY_FIRESTORE_TOKEN: "owner",
    },
  });
  expect(await status("sharedGames/" + sha(quiet))).toBe(200);
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:4187" });
  try {
    const player = await other.newPage();
    await player.goto("/");
    await player
      .getByRole("button", { name: "Training plan", exact: true })
      .click();
    await player.getByText("Shared puzzle library", { exact: true }).click();
    await player
      .getByRole("button", { name: "Mate in one", exact: true })
      .click();
    await player
      .getByRole("button", { name: /Open puzzle .*unrated/ })
      .first()
      .click();
    const link = player.getByRole("link", { name: "Source game" });
    await expect(link).toHaveAttribute(
      "href",
      "?sharedGame=" + sha(pgn) + "&ply=3",
    );
    const replayReady = other.waitForEvent("page");
    await link.click();
    const replay = await replayReady;
    await expect(replay.getByText("g4 · 3 of 4 plies")).toBeVisible();
    await replay.getByRole("button", { name: "Next move" }).click();
    await expect(replay.getByText("Qh4# · 4 of 4 plies")).toBeVisible();
    await replay.getByText("Full PGN", { exact: true }).click();
    await expect(replay.locator("pre")).toHaveText(pgn);
    await player.getByRole("gridcell", { name: /Black queen on d8/ }).click();
    await player.getByRole("gridcell", { name: /Empty h4/ }).click();
    await expect(player.getByText("Good move", { exact: true })).toBeVisible();
  } finally {
    await other.close();
  }
});
