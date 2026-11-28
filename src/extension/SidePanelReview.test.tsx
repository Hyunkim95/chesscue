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

  // A game still in the queue can be watched while Rook checks it.
  const row = await screen.findByRole("button", { name: /vs\. Maya.*Win/ });
  expect(within(row).getByText("W", { exact: true })).toBeVisible();
  expect(
    within(row).getByText("Checking now · you can watch it"),
  ).toBeVisible();
  expect(row).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Checking 1 game on your device",
  );
  fireEvent.click(row);
  expect(openSavedGame).toHaveBeenCalledWith("#review/lichess-review");
  gameList.rerender(panel(new Set()));
  await waitFor(() => {
    expect(within(row).getByText("Lichess", { exact: true })).toBeVisible();
  });
  expect(row.querySelector("time")).toHaveAttribute("datetime", "2026-11-28");
  expect(row).not.toHaveAttribute("aria-busy");
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows the chances a checked game's replay stops at on its row", async () => {
  const gameId = createGameId("counted-game");
  const [item] = importGames({
    text: '[White "You"]\n[Black "Ines"]\n[UTCDate "2026.11.27"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
    source: { type: "paste" },
    playerColor: "white",
    existingFingerprints: new Set(),
    idFactory: () => gameId,
    now: () => "2026-11-27T13:00:00.000Z",
    curriculumVersion: "1",
    configurationVersion: "1",
  }).items;
  if (item?.status !== "accepted") throw new Error("Invalid test PGN");
  const repository = new IndexedDbGameRepository("games-count-test");
  expect((await repository.put(item.game.record)).ok).toBe(true);
  render(
    <SidePanelReview
      boardFirst
      watchLichess={false}
      repository={repository}
      historyRevision={0}
      openGame={vi.fn()}
      openSavedGame={vi.fn()}
      importPgn={vi.fn()}
      importFrom={vi.fn()}
      momentCounts={new Map([[gameId, { wins: 1, misses: 2 }]])}
    />,
  );
  const row = await screen.findByRole("button", { name: /vs\. Ines/ });
  expect(row).toHaveAccessibleName(/1 chance taken.*2 missed/);
  expect(within(row).getByText("★ 1")).toBeVisible();
  expect(within(row).getByText("2")).toBeVisible();
});
