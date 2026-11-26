/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { z } from "zod";
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
  await page.getByLabel("Choose a PGN file").setInputFiles({
    name: "batch.pgn",
    mimeType: "application/x-chess-pgn",
    buffer: Buffer.from([pgn, quiet, pgn, invalid].join("\n\n")),
  });
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
  const gameKey = z.object({
    fields: z.object({ gameKey: z.object({ stringValue: z.string() }) }),
  });
  const evidence = async (score: string) => {
    const archived = gameKey.parse(
      await (await fetch(documents + "sharedGames/" + sha(score))).json(),
    );
    return (await (
      await fetch(
        documents +
          "submittedMateEvidence/" +
          archived.fields.gameKey.stringValue,
        { headers: { authorization: "Bearer owner" } },
      )
    ).json()) as unknown;
  };
  expect(await evidence(pgn)).toMatchObject({
    fields: {
      opportunities: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  outcome: { stringValue: "found" },
                  side: { stringValue: "b" },
                  ply: { integerValue: "4" },
                },
              },
            },
          ],
        },
      },
    },
  });
  expect(await evidence(quiet)).toMatchObject({
    fields: { puzzleId: { nullValue: null } },
  });
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
    for (const width of [320, 1280]) {
      await replay.setViewportSize({ width, height: 800 });
      expect(
        await replay.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await replay.screenshot({
        path: test.info().outputPath("shared-game-" + String(width) + ".png"),
      });
    }
    await player.getByRole("gridcell", { name: /Black queen on d8/ }).click();
    await player.getByRole("gridcell", { name: /Empty h4/ }).click();
    await expect(player.getByText("Good move", { exact: true })).toBeVisible();
  } finally {
    await other.close();
  }
});
