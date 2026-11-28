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

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

it("opens a saved report, compares the verified alternative, and reuses the report on reopen", async () => {
  const gameId = createGameId("full-game-report");
  const [item] = importGames({
    text: '[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2',
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
  const boardPositions = [
    game.initialFen,
    ...game.moves.map(({ fenAfter }) => fenAfter),
  ];
  const candidates = [
    { uci: "e2e4", cp: 20 },
    { uci: "c7c5", cp: -20 },
    { uci: "g1f3", cp: 250 },
  ];
  expect((await guestHistory.games.put(game)).ok).toBe(true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.spyOn(StockfishAnalysisEngine.prototype, "initialize").mockResolvedValue(
    ok(undefined),
  );
  const analyze = vi
    .spyOn(StockfishAnalysisEngine.prototype, "analyze")
    .mockImplementation(({ fen }) => {
      const candidate = candidates[boardPositions.indexOf(fen)];
      return Promise.resolve(
        candidate
          ? ok({
              candidates: [
                {
                  uci: candidate.uci,
                  evaluationCpFromSideToMove: candidate.cp,
                  principalVariation: [candidate.uci],
                  depth: 13,
                },
              ],
            })
          : err({ code: "no-analysis", message: "Unexpected test position" }),
      );
    });

  window.history.replaceState(null, "", `/#review/${gameId}/report`);
  const view = render(<App />);
  expect(await screen.findByText("White accuracy")).toBeVisible();
  expect(screen.getByText("Black accuracy")).toBeVisible();
  const board = within(screen.getByRole("grid", { name: "Game report board" }));
  fireEvent.click(screen.getByRole("button", { name: /e5 · Mistake/ }));
  expect(
    board.getByRole("gridcell", { name: /Black pawn on c7/ }),
  ).toBeVisible();
  fireEvent.click(board.getByRole("gridcell", { name: /Black pawn on c7/ }));
  fireEvent.click(board.getByRole("gridcell", { name: /Empty c5/ }));
  expect(screen.getByText("You found Stockfish’s move.")).toBeVisible();
  expect(
    board.getByRole("gridcell", { name: /Black pawn on c5/ }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Show played move" }));
  expect(
    board.getByRole("gridcell", { name: /Black pawn on e5/ }),
  ).toBeVisible();
  expect(analyze).toHaveBeenCalledTimes(3);

  view.unmount();
  render(<App />);
  expect(await screen.findByText("White accuracy")).toBeVisible();
  expect(analyze).toHaveBeenCalledTimes(3);
});
