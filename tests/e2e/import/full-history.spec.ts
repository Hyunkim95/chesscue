import { expect, test } from "@playwright/test";
import { Chess } from "chess.js";

// A Lichess account with more games than one lookup returns. Every game has
// its own moves, because imports are deduplicated by moves.
const TOTAL = 130;
const NEWEST = 1_700_000_000_000;

function history() {
  const seen = new Set<string>();
  const games: { id: string; createdAt: number; pgn: string }[] = [];
  for (let seed = 0; games.length < TOTAL; seed++) {
    const board = new Chess();
    for (let ply = 0; ply < 8; ply++) {
      const legal = board.moves();
      const pick = legal[(seed * 7 + ply * 13 + (seed >> ply)) % legal.length];
      if (!pick) break;
      board.move(pick);
    }
    const moves = board
      .history()
      .map((san, ply) =>
        ply % 2 === 0 ? `${String(ply / 2 + 1)}. ${san}` : san,
      )
      .join(" ");
    if (seen.has(moves)) continue;
    seen.add(moves);
    const index = games.length;
    games.push({
      id: "h" + String(index).padStart(7, "0"),
      createdAt: NEWEST - index * 60_000,
      pgn: `[Event "Rated blitz"]\n[White "Sam"]\n[Black "Mira"]\n[UTCDate "2026.11.24"]\n[Result "1-0"]\n\n${moves} 1-0`,
    });
  }
  return games;
}

test.use({ viewport: { width: 320, height: 760 } });

test("fetches a whole Lichess history in the background and checks only the newest 50", async ({
  page,
}) => {
  const games = history();
  await page.route("https://lichess.org/api/games/user/sam?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    const max = Number(query.get("max"));
    const until = query.get("until");
    const body = games
      .filter(({ createdAt }) => until === null || createdAt <= Number(until))
      .slice(0, max)
      .map(({ id, createdAt, pgn }) =>
        JSON.stringify({
          id,
          variant: "standard",
          status: "resign",
          createdAt,
          pgn,
        }),
      )
      .join("\n");
    return route.fulfill({
      contentType: "application/x-ndjson",
      headers: { "access-control-allow-origin": "*" },
      body,
    });
  });
  // Every game ever queued for Stockfish, even after the check finishes.
  await page.addInitScript(() => {
    const queued = new Set<string>();
    Object.assign(window, { queuedForCheck: queued });
    window.addEventListener("chesscue-pending-import-analysis-changed", () => {
      const raw = localStorage.getItem("chesscue-pending-import-analysis");
      for (const id of JSON.parse(raw ?? "[]") as string[]) queued.add(id);
    });
  });

  await page.goto("/?ui=board-first#import/lichess");
  await page.getByRole("textbox", { name: "Lichess username" }).fill("sam");
  await page.getByRole("button", { name: "Import games", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Added 20 games." }),
  ).toBeVisible({ timeout: 30_000 });

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Games" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /Fetching your Lichess history/ }),
  ).toBeVisible();
  // The history is done when its progress line goes.
  await expect(
    page.getByRole("status").filter({ hasText: /Lichess history/ }),
  ).toHaveCount(0, { timeout: 30_000 });

  // Rows come a page at a time as the player scrolls.
  const rows = page
    .getByRole("list", { name: "Completed games" })
    .getByRole("listitem");
  await expect(rows).toHaveCount(20);
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(40);
  for (let shown = 40; shown < TOTAL; shown += 20) {
    await rows.last().scrollIntoViewIfNeeded();
    await expect(rows).toHaveCount(Math.min(shown + 20, TOTAL));
  }
  await expect(
    page.getByRole("status").filter({ hasText: "Loading more games…" }),
  ).toHaveCount(0);

  const queued = await page.evaluate(
    () =>
      (window as unknown as { queuedForCheck: Set<string> }).queuedForCheck
        .size,
  );
  expect(queued).toBe(50);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});
