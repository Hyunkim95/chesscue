import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Chess } from "chess.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createGameId, type GameRecord } from "../../domain/game/types";
import { GameWatchScreen, type WatchMarkers } from "./GameWatchScreen";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Fool's mate, played as Black: Qh4# is the player's win.
function foolsMate(): GameRecord {
  const chess = new Chess();
  const moves = ["f3", "e5", "g4", "Qh4#"].map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      uci: move.lan,
      san: move.san,
      fenAfter: move.after,
      playedAt: "2026-11-27T10:00:00.000Z",
    };
  });
  return {
    schemaVersion: 1,
    id: createGameId("watch-fools-mate"),
    origin: { type: "pgn-paste" },
    playerColor: "black",
    result: "black-win",
    initialFen: new Chess().fen(),
    moves,
    pgn: chess.pgn(),
    createdAt: "2026-11-27T10:00:00.000Z",
    completedAt: "2026-11-27T10:30:00.000Z",
    fingerprint: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };
}

const MARKERS: WatchMarkers = {
  kind: "ready",
  markers: [{ ply: 4, kind: "win", san: "Qh4#", moveLabel: "Move 2" }],
};

const bubble = () =>
  screen.getByText(
    (_, node) => node?.classList.contains("rook-bubble__text") ?? false,
  );

function watch(onTry = vi.fn(), markers = MARKERS) {
  render(
    <GameWatchScreen
      game={foolsMate()}
      title="You beat Maya"
      subtitle="Thu · Lichess · you played Black"
      opponent="Maya"
      markers={markers}
      evaluations={{ kind: "checking", completed: 1, total: 5 }}
      onTry={onTry}
    />,
  );
  return onTry;
}

const step = () => {
  act(() => {
    vi.advanceTimersByTime(1_000);
  });
};

it("plays the game and stops at a win without naming the move", () => {
  const onTry = watch();
  step();
  expect(bubble()).toHaveTextContent("Maya plays f3.");
  step();
  expect(bubble()).toHaveTextContent("You play e5.");
  step();
  expect(bubble()).toHaveTextContent(
    "Maya played g4. Is there something here?",
  );
  expect(bubble()).not.toHaveTextContent("Qh4");
  // It waits for the player.
  step();
  expect(bubble()).toHaveTextContent("Is there something here?");
  fireEvent.click(screen.getByRole("button", { name: "Try it" }));
  expect(onTry).toHaveBeenCalledWith(4);
});

it("keeps watching to the end, which is the report", () => {
  const onTry = watch();
  step();
  step();
  step();
  fireEvent.click(screen.getByRole("button", { name: "Keep watching" }));
  step();
  expect(bubble()).toHaveTextContent("You play Qh4#.");
  step();
  expect(
    screen.getByRole("heading", { level: 1, name: /You beat Maya/ }),
  ).toBeVisible();
  expect(screen.getByText("taken")).toBeVisible();
  expect(screen.queryByText(/accuracy/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Move 2 · Qh4#/ }));
  expect(onTry).toHaveBeenCalledWith(4);
});

it("jumps to the next moment and comes back to the one last tried", () => {
  watch();
  fireEvent.click(screen.getByRole("button", { name: /Next moment/ }));
  expect(bubble()).toHaveTextContent("Is there something here?");
  cleanup();
  render(
    <GameWatchScreen
      game={foolsMate()}
      title="You beat Maya"
      subtitle="Thu · Lichess · you played Black"
      opponent="Maya"
      markers={MARKERS}
      evaluations={{ kind: "failed" }}
      resume={{ kind: "marker", ply: 4 }}
      onTry={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Keep watching" })).toBeVisible();
});

it("plays a game whose moments are still being found", () => {
  watch(vi.fn(), { kind: "checking" });
  for (let move = 0; move < 4; move += 1) step();
  expect(bubble()).toHaveTextContent("You play Qh4#.");
  expect(screen.getByText("Finding your moments…")).toBeVisible();
});
