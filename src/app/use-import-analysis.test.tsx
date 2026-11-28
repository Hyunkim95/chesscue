// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { importGames } from "../application/import-games/import-games";
import { createGameId, type GameRecord } from "../domain/game/types";
import { PlayerHistory } from "../infrastructure/persistence/player-history";
import { queueImportAnalysis, useImportAnalysis } from "./use-import-analysis";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("only queued imports are analyzed, one at a time, and pending work resumes", async () => {
  const history = new PlayerHistory("import-analysis-test");
  const games = importGames({
    text: [
      '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
      '[Result "1/2-1/2"]\n\n1. d4 d5 1/2-1/2',
      '[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2',
    ].join("\n\n"),
    source: { type: "paste" },
    playerColor: "black",
    existingFingerprints: new Set(),
    idFactory: () => createGameId(crypto.randomUUID()),
    now: () => "2026-11-28T12:00:00.000Z",
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
  }).items.flatMap((item) =>
    item.status === "accepted" ? [item.game.record] : [],
  );
  expect(games).toHaveLength(3);
  for (const game of games)
    expect(await history.games.put(game)).toEqual({
      ok: true,
      value: undefined,
    });
  queueImportAnalysis(history, games.slice(1, 2));
  queueImportAnalysis(history, games.slice(2));
  vi.stubGlobal("requestIdleCallback", (callback: IdleRequestCallback) =>
    window.setTimeout(() => {
      callback({ didTimeout: false, timeRemaining: () => 10 });
    }, 0),
  );
  vi.stubGlobal("cancelIdleCallback", (id: number) => {
    window.clearTimeout(id);
  });

  let finishFirst = (): void => {
    throw new Error("The search has not started");
  };
  const firstSearch = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  const analyze = vi
    .fn<(owner: PlayerHistory, game: GameRecord) => Promise<void>>()
    .mockReturnValueOnce(firstSearch)
    .mockResolvedValue(undefined);
  const first = renderHook(
    ({ enabled }) => useImportAnalysis(history, enabled, 0, analyze),
    {
      initialProps: { enabled: false },
    },
  );
  expect(analyze).not.toHaveBeenCalled();
  expect([...first.result.current]).toEqual(games.slice(1).map(({ id }) => id));
  first.rerender({ enabled: true });
  await waitFor(() => {
    expect(analyze).toHaveBeenCalledExactlyOnceWith(history, games[1]);
  });
  first.unmount();
  finishFirst();
  await firstSearch;

  const reopened = new PlayerHistory(history.uid);
  const resumed = renderHook(() =>
    useImportAnalysis(reopened, true, 0, analyze),
  );
  await waitFor(() => {
    expect(analyze).toHaveBeenCalledTimes(2);
  });
  expect(analyze).toHaveBeenNthCalledWith(2, reopened, games[2]);
  await waitFor(() => {
    expect(resumed.result.current.size).toBe(0);
  });
  resumed.unmount();
});
