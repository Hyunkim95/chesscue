import "fake-indexeddb/auto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { importGames } from "../application/import-games/import-games";
import { createGameId } from "../domain/game/types";
import { IndexedDbGameRepository } from "../infrastructure/persistence/indexeddb-game-repository";
import { SidePanelReview } from "./SidePanelReview";

afterEach(cleanup);

it("shows a compact result, source and date on each saved-game row and opens that game", async () => {
  const gameId = createGameId("lichess-review");
  const [item] = importGames({
    text: '[Site "https://lichess.org/abcd1234"]\n[White "You"]\n[Black "Maya"]\n[UTCDate "2026.11.28"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    source: { type: "paste" },
    playerColor: "white",
    existingFingerprints: new Set(),
    idFactory: () => gameId,
    now: () => "2026-11-28T13:00:00.000Z",
    curriculumVersion: "1",
    configurationVersion: "1",
  }).items;
  if (item?.status !== "accepted") throw new Error("Invalid test PGN");

  const repository = new IndexedDbGameRepository("games-list-test");
  expect((await repository.put(item.game.record)).ok).toBe(true);
  const openSavedGame = vi.fn();
  const panel = (pendingAnalysis: ReadonlySet<typeof gameId>) => (
    <SidePanelReview
      boardFirst
      watchLichess={false}
      repository={repository}
      historyRevision={0}
      openGame={vi.fn()}
      openSavedGame={openSavedGame}
      importPgn={vi.fn()}
      importFrom={vi.fn()}
      pendingAnalysis={pendingAnalysis}
    />
  );
  const gameList = render(panel(new Set([gameId])));

  const row = await screen.findByRole("button", { name: /vs\. Maya.*Win/ });
  expect(within(row).getByText("W", { exact: true })).toBeVisible();
  expect(within(row).getByText("Lichess", { exact: true })).toBeVisible();
  expect(row.querySelector("time")).toHaveAttribute("datetime", "2026-11-28");
  expect(row).toBeDisabled();
  expect(row).toHaveAttribute("aria-busy", "true");
  expect(within(row).getByText("Analysis pending")).toBeInTheDocument();
  fireEvent.click(row);
  expect(openSavedGame).not.toHaveBeenCalled();
  gameList.rerender(panel(new Set()));
  await waitFor(() => {
    expect(row).toBeEnabled();
  });
  fireEvent.click(row);
  expect(openSavedGame).toHaveBeenCalledWith("#review/lichess-review");
});
