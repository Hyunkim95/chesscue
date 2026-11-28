import { expect, test, type Page } from "@playwright/test";
import { Chess } from "chess.js";

import { ANALYSIS_VERSION } from "../../../src/app/analysis-version";

// Spot the danger (PRD §5.8, approved 28 November 2026), on the approved
// mock's position from a Lichess game. White's 13. Nxd4 leaves Black's queen
// on e6 loose; in the game Black played Be5 and White took on c6, then the
// rook on d8. Stockfish 19 lite, depth 16, multiPv 3. Playwright's Chromium
// has no on-device model, so this is the tap path. Today does not serve this
// position, because Bb4+ and Nxd4 are about equally good, so it is opened by
// its link, as from Review.

const square = (page: Page, name: string) =>
  page.locator(`[role=gridcell][aria-label^="${name}"]`).first();
const bubble = (page: Page) => page.locator(".rook-bubble__text");
const SHOTS = "test-results/spot-the-danger";

// The position before White's Nxd4, with a black pawn on d4.
const START =
  "2kr3r/1pp2pp1/p1nbqn2/3p3p/3p4/1P2PNP1/PBP2PBP/R2QK2R w KQ - 0 13";
const GAME = ["Nxd4", "Be5", "Nxc6", "Bxb2", "Nxd8", "Bxa1", "Qxa1", "Rxd8"];
const ID = "11111111-2222-4333-8444-0000000000d1";

function seededGame() {
  const chess = new Chess(START);
  chess.setHeader("White", "Ahmed");
  chess.setHeader("Black", "You");
  const fens: string[] = [];
  const moves = GAME.map((san, index) => {
    fens.push(chess.fen());
    const move = chess.move(san);
    return {
      ply: index + 1,
      san: move.san,
      uci: move.lan,
      fenAfter: move.after,
      playedAt: new Date(Date.UTC(2026, 10, 24, 18, index)).toISOString(),
    };
  });
  const candidates = [
    ["d6b4", 37, "d6b4 e1f1 c6d4 d1d4 b4d6 h2h4 c8b8 c2c4 e6f5 c4d5"],
    ["c6d4", 34, "c6d4 d1d4 h5h4 e1c1 c7c5 d4d2 d6e5 d2a5 e5b2 c1b2"],
    ["e6e7", -68, "e6e7 d4c6 b7c6 e1g1 h5h4 c2c4 h4g3 h2g3 f6e4 d1e2"],
  ] as const;
  const fact = {
    schemaVersion: 1,
    gameId: ID,
    ply: 2,
    fenBefore: fens[1],
    playedMoveUci: "d6e5",
    playedMoveSan: "Be5",
    evaluationBeforeCp: 37,
    evaluationAfterCp: -610,
    impactCp: 647,
    phase: "middlegame",
    theme: "hanging-piece",
    recurrence: 0,
    curricularRelevance: 50,
    candidates: candidates.map(([uci, evaluationCp, line]) => ({
      uci,
      evaluationCp,
      principalVariation: line.split(" "),
    })),
    analysisVersion: ANALYSIS_VERSION,
  };
  return {
    game: {
      schemaVersion: 1,
      id: ID,
      origin: { type: "pgn-paste" },
      initialFen: START,
      moves,
      pgn: chess.pgn(),
      playerColor: "black",
      result: "white-win",
      createdAt: moves[0]?.playedAt,
      completedAt: moves.at(-1)?.playedAt,
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      fingerprint: null,
    },
    analysis: {
      schemaVersion: 1,
      gameId: ID,
      analysisVersion: ANALYSIS_VERSION,
      engineBuild: "stockfish-19-lite",
      searchSettings: { timeBudgetPerPositionMs: 1_000, multiPv: 3 },
      facts: [fact],
      moments: [],
      analyzedPlayerMoves: 1,
      validationStatus: "validated",
      analyzedAt: new Date(Date.UTC(2026, 10, 24, 19)).toISOString(),
    },
    key: JSON.stringify([ID, ANALYSIS_VERSION]),
  };
}

async function seed(page: Page) {
  await page.goto("/?ui=board-first");
  await expect(page.locator(".today")).toBeVisible({ timeout: 20_000 });
  // Installed, so the position also opens with no network.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.evaluate(async ({ game, analysis, key }) => {
    const request = indexedDB.open("adaptive-chess-tutor");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(new Error("IndexedDB did not open"));
      };
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["games", "analyses"], "readwrite");
      tx.objectStore("games").put(game);
      tx.objectStore("analyses").put(analysis, key);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(new Error("The game was not stored"));
      };
    });
    db.close();
  }, seededGame());
  await page.reload();
}

// Rook's idle breathing never ends, so endless animations are left out.
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
}

async function shoot(page: Page, name: string, width: number) {
  await settle(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(width);
  await page.screenshot({
    path: `${SHOTS}/${name}-${String(width)}.png`,
    fullPage: true,
  });
}

for (const width of [320, 1280]) {
  test(`a loose queen is spotted by tapping it, then a safe move is found, at ${String(width)} px`, async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 860 });
    await seed(page);
    const question =
      "White just played Nxd4. Is something of yours in trouble?";
    // The tap path needs no network and no model: at 320 px the installed
    // app opens the position offline.
    if (width === 320) await context.setOffline(true);
    await page.goto(`/?ui=board-first#moment/${ID}%3A2`);
    await page.reload();

    // 1 · Before: only White's last move is marked.
    await expect(page.getByRole("heading", { name: question })).toBeVisible({
      timeout: 30_000,
    });
    await expect(bubble(page)).toHaveText(
      "Tap the piece you'd worry about. Or tell me what you see.",
    );
    await expect(square(page, "White knight on d4")).toHaveClass(/highlighted/);
    await expect(page.locator("[data-move-cue-arrow]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "What are you threatening?" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hint" })).toBeVisible();
    await shoot(page, "1-before", width);

    // A partial answer gets a nudge, not the answer.
    await square(page, "Black knight on c6").click();
    await expect(bubble(page)).toHaveText(
      "True, your knight on c6 is attacked. Something bigger is too. Follow the knight's other jumps.",
    );
    await expect(page.locator("[data-move-cue-arrow]")).toHaveCount(0);
    await shoot(page, "2-nudged", width);

    // 3 · Spotted: coral arrows from the knight, outlines on what it hits.
    await square(page, "Black queen on e6").click();
    await expect(
      page.getByRole("heading", { name: /Spotted it\./ }),
    ).toBeVisible();
    await expect(page.locator("[data-move-cue-arrow='d4:e6']")).toHaveCount(1);
    await expect(page.locator("[data-move-cue-arrow='d4:c6']")).toHaveCount(1);
    await expect(page.locator(".chess-board__cue-arrow--reply")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "↺ Reset" })).toHaveCount(0);
    await expect(square(page, "Black queen on e6")).toHaveClass(
      /outline-coral/,
    );
    await expect(square(page, "Black knight on c6")).toHaveClass(
      /outline-coral/,
    );
    await expect(bubble(page)).toHaveText(
      "Yes. White threatens Nxe6, winning your queen for a knight. In your game, after Be5, White plays Nxc6, taking your knight on c6.",
    );
    await expect(page.getByRole("textbox", { name: "Ask Rook" })).toHaveCount(
      0,
    );
    await shoot(page, "3-spotted", width);

    // What happened in the game, step by step, then back.
    await page.getByRole("button", { name: "Show what happened" }).click();
    await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible();
    await page.getByRole("button", { name: "Next step" }).click();
    await expect(bubble(page)).toHaveText("I take your knight with Nxc6.");
    await shoot(page, "3b-what-happened", width);
    await page.getByRole("button", { name: "↺ Reset" }).click();
    await expect(page.locator("[data-move-cue-arrow='d4:e6']")).toHaveCount(1);

    // 4 · The moment loop: find a safe move.
    await page.getByRole("button", { name: "Find a safe move" }).click();
    await expect(
      page.getByRole("heading", { name: /Your move\. Keep everything safe\./ }),
    ).toBeVisible();
    await expect(bubble(page)).toHaveText(
      "Play it on the board. I'll answer with White's best reply.",
    );
    await expect(page.locator("[data-move-cue-arrow]")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "What are you threatening?" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show me" })).toBeVisible();
    await shoot(page, "4-find-safe-move", width);

    await square(page, "Black bishop on d6").click();
    await square(page, "Empty b4").click();
    await page
      .getByRole("button", { name: "Done ✓" })
      .click({ timeout: 30_000 });
    // The idea is named only now.
    await expect(page.getByText("You spotted it! ✨")).toBeVisible();
    await expect(page.locator(".moment__idea-card")).toContainText(
      "Added to your collection",
    );
    await shoot(page, "5-celebration", width);
  });
}

// Chrome's Prompt API stubbed in the page: a model on the device that matches
// words about c6 to the knight's fact. This checks the wiring from the ask bar
// through Firebase's on-device route to Rook's code-written line, not Nano's
// own understanding.
test("Rook nudges a partial answer and spots a described threat, at 320 px", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 860 });
  await page.addInitScript(() => {
    const seen: unknown[] = [];
    Object.assign(window, {
      spotDangerPrompts: seen,
      LanguageModel: {
        availability: () => Promise.resolve("available"),
        create: () =>
          Promise.resolve({
            prompt: (contents: unknown, options: unknown) => {
              seen.push({ contents, options });
              const text = JSON.stringify(contents);
              return Promise.resolve(
                JSON.stringify({
                  fact: text.includes("threatening my queen")
                    ? "wins-material:e6"
                    : text.includes("can take my knight")
                      ? "attacked-but-safe:c6"
                      : "none",
                }),
              );
            },
            destroy: () => undefined,
          }),
      },
    });
  });
  await seed(page);
  await context.setOffline(true);
  await page.goto(`/?ui=board-first#moment/${ID}%3A2`);
  await page.reload();
  const input = page.getByRole("textbox", { name: "Ask Rook" });
  await expect(input).toHaveAttribute(
    "placeholder",
    "Tell Rook what you see…",
    { timeout: 30_000 },
  );
  await input.fill("the knight can take my knight on c6");
  await input.press("Enter");
  await expect(page.locator(".rook-bubble__understood")).toHaveText(
    "Gemini Nano understood · knight on c6 attacked",
    { timeout: 15_000 },
  );
  await expect(bubble(page)).toHaveText(
    "True, your knight on c6 is attacked. Something bigger is too. Follow the knight's other jumps.",
  );
  // Feedback only: nothing drawn, nothing spotted.
  await expect(page.locator("[data-move-cue-arrow]")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /Is something of yours in trouble/ }),
  ).toBeVisible();
  // The model could only choose among the position's checked facts.
  const prompts = await page.evaluate(() =>
    (
      window as unknown as { spotDangerPrompts: unknown[] }
    ).spotDangerPrompts.map((prompt) => JSON.stringify(prompt)),
  );
  const reading = prompts.find((prompt) => prompt.includes('\\"facts\\"'));
  expect(reading).toContain('"enum":["none","wins-material:e6"');
  // The hint that fits the answer: one of the hints code built, nothing else.
  const hint = prompts.find((prompt) => prompt.includes('\\"hints\\"'));
  expect(hint).toContain(
    '"enum":["check-their-threats","bigger-target","scan"]',
  );
  await shoot(page, "2-nano-nudge", 320);
  await input.fill("White's knight is threatening my queen on e6");
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: /Spotted it\./ }),
  ).toBeVisible();
  await expect(page.locator("[data-move-cue-arrow='d4:e6']")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Find a safe move" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Done ✓" }).click();
  await expect(
    page.getByRole("dialog", { name: "Threat spotted" }),
  ).toBeVisible();
});

test("Done saves the threat spot and Today advances offline", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 860 });
  await seed(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Play it", exact: true }).click();
  await square(page, "Black queen on e6").click();
  await page.getByRole("button", { name: "Done ✓" }).click();
  const completion = page.getByRole("dialog", { name: "Threat spotted" });
  await expect(completion).toBeVisible();
  await completion.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Next moment" }).click();
  await page.reload();
  await expect(page.locator(".today")).toBeVisible();
  await expect(page.getByText(/Your game vs Ahmed/)).toHaveCount(0);
});
