import "fake-indexeddb/auto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { importGames } from "../application/import-games/import-games";
import { createGameId } from "../domain/game/types";
import { StockfishAnalysisEngine } from "../infrastructure/engine/stockfish-analysis-engine";
import { guestHistory } from "../infrastructure/persistence/player-history";
import { err, ok } from "../shared/result/result";
import { App } from "./App";

// These journeys cover the classic screens, which ?ui=classic keeps
// reachable now that board-first is the web default.
vi.mock(import("./board-first/flag"), async (importOriginal) => ({
  ...(await importOriginal()),
  boardFirst: false,
}));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

it("opens Next move from the replay position and returns to the original game line", async () => {
  const gameId = createGameId("replay-next-move");
  const [item] = importGames({
    text: '[Result "0-1"]\n\n1. e4 c5 0-1',
    source: { type: "paste" },
    playerColor: "black",
    existingFingerprints: new Set(),
    idFactory: () => gameId,
    now: () => "2026-11-28T13:00:00.000Z",
    curriculumVersion: "1",
    configurationVersion: "1",
  }).items;
  if (item?.status !== "accepted") throw new Error("Invalid test game");
  const game = item.game.record;
  expect((await guestHistory.games.put(game)).ok).toBe(true);

  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.spyOn(StockfishAnalysisEngine.prototype, "initialize").mockResolvedValue(
    ok(undefined),
  );
  vi.spyOn(StockfishAnalysisEngine.prototype, "analyze").mockImplementation(
    ({ fen }) =>
      Promise.resolve(
        fen === game.moves[0]?.fenAfter
          ? ok({
              candidates: [
                {
                  uci: "e7e5",
                  evaluationCpFromSideToMove: 0,
                  principalVariation: ["e7e5"],
                  depth: 18,
                },
              ],
            })
          : err({
              code: "not-ready",
              message: "No analysis for this test position",
            }),
      ),
  );
  window.history.replaceState(null, "", `/#review/${gameId}/replay`);
  render(<App />);

  const advance = await screen.findByRole("button", { name: "Play game move" });
  fireEvent.click(advance);
  fireEvent.click(screen.getByRole("button", { name: /^Analyze next move$/ }));
  const analysisBoard = await screen.findByRole("grid", {
    name: "Next move board",
  });
  expect(
    within(analysisBoard).getAllByRole("gridcell")[0],
  ).toHaveAccessibleName(/White rook on h1/);
  expect(
    within(analysisBoard).getByRole("gridcell", { name: /White pawn on e4/ }),
  ).toBeVisible();
  fireEvent.click(
    await screen.findByRole("button", { name: "Play line 1 up to e5" }),
  );
  expect(
    within(analysisBoard).getByRole("gridcell", { name: /Black pawn on e5/ }),
  ).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Back to replay" }));
  const replayBoard = await screen.findByRole("grid", {
    name: "Review board, Black side",
  });
  expect(
    within(replayBoard).getByRole("gridcell", { name: /White pawn on e4/ }),
  ).toBeVisible();
  expect(
    within(replayBoard).getByRole("gridcell", { name: /Black pawn on e7/ }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Play game move" }));
  expect(
    within(replayBoard).getByRole("gridcell", { name: /Black pawn on c5/ }),
  ).toBeVisible();
});
