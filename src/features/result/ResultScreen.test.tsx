import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Chess } from "chess.js";
import { afterEach, expect, test, vi } from "vitest";

import { createGameId, type GameRecord } from "../../domain/game/types";
import { finalPosition, type FinalPosition } from "./final-position";
import {
  ResultScreen,
  type ResultMoments,
  type ResultRating,
} from "./ResultScreen";

afterEach(cleanup);

const won: FinalPosition = {
  fen: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
  lastMoveUci: "h5f7",
  orientation: "white",
  outcome: "won",
};

function renderResult({
  position = won,
  rating = { kind: "rated", before: 1230, after: 1240 },
  moments = { kind: "found", count: 2 },
  share,
}: {
  position?: FinalPosition;
  rating?: ResultRating;
  moments?: ResultMoments;
  share?: string;
} = {}) {
  const callbacks = {
    onLookAtMoments: vi.fn(),
    onPlayAgain: vi.fn(),
    onRetryRating: vi.fn(),
  };
  const view = render(
    <ResultScreen
      position={position}
      rating={rating}
      moments={moments}
      share={share}
      {...callbacks}
    />,
  );
  return { ...view, ...callbacks };
}

const heading = () => screen.getByRole("heading", { level: 1 });
const primaries = (container: HTMLElement) =>
  container.querySelectorAll(".ui-button--primary");

test("shows the final position from the player's side with the last move", () => {
  renderResult({ position: { ...won, orientation: "black" } });
  const board = screen.getByRole("grid", { name: "Final position" });
  expect(board).toBeInTheDocument();
  expect(
    screen.getAllByRole("gridcell")[0]?.getAttribute("aria-label"),
  ).toMatch(/^.* h1/);
  expect(
    screen.getByRole("gridcell", { name: /^Empty h5, last move started here/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("gridcell", { name: /queen on f7.*last move ended here/ }),
  ).toBeInTheDocument();
});

test("a rated win names the Elo change and the next rank", () => {
  renderResult();
  expect(heading()).toHaveTextContent("You won · +10 Elo");
  expect(screen.getByText("Sapphire at 1350 · 110 to go")).toBeInTheDocument();
});

test("a rated loss and a draw show their own change", () => {
  renderResult({
    position: { ...won, outcome: "lost" },
    rating: { kind: "rated", before: 1450, after: 1442 },
  });
  expect(heading()).toHaveTextContent("You lost · -8 Elo");
  cleanup();
  renderResult({
    position: { ...won, outcome: "draw" },
    rating: { kind: "rated", before: 1450, after: 1450 },
  });
  expect(heading()).toHaveTextContent("Draw · +0 Elo");
});

test("a coached game is unrated and never calculates Elo", () => {
  renderResult({ rating: { kind: "unrated" } });
  expect(heading()).toHaveTextContent("You won · Coached game, unrated");
  expect(screen.queryByText(/Elo/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Calculating/)).not.toBeInTheDocument();
  expect(screen.queryByText(/to go/)).not.toBeInTheDocument();
});

test("a rating still loading shows the result alone without a spinner", () => {
  renderResult({ rating: { kind: "loading" } });
  expect(heading()).toHaveTextContent(/^You won$/);
  expect(screen.queryByText(/Calculating/)).not.toBeInTheDocument();
  expect(document.querySelector("[aria-busy]")).toBeNull();
});

test("a rating error is a quiet line with Try again", () => {
  const { onRetryRating } = renderResult({ rating: { kind: "failed" } });
  expect(heading()).toHaveTextContent(/^You won$/);
  expect(screen.getByRole("status")).toHaveTextContent("Rating unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRetryRating).toHaveBeenCalledOnce();
});

test("moments: one brass Look at them, with Play again as the quiet second action", () => {
  const { container, onLookAtMoments, onPlayAgain } = renderResult();
  expect(
    screen.getByRole("heading", { name: "Rook found 2 moments in this game" }),
  ).toBeInTheDocument();
  expect(primaries(container)).toHaveLength(1);
  const look = screen.getByRole("button", { name: "Look at them" });
  expect(look).toHaveClass("ui-button--primary");
  expect(screen.getByRole("button", { name: "Play again" })).toHaveClass(
    "ui-button--ghost",
  );
  fireEvent.click(look);
  expect(onLookAtMoments).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Play again" }));
  expect(onPlayAgain).toHaveBeenCalledOnce();
});

test("one moment is singular", () => {
  renderResult({ moments: { kind: "found", count: 1 } });
  expect(screen.getByRole("button", { name: "Look at it" })).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Rook found 1 moment in this game" }),
  ).toBeInTheDocument();
});

test("no moments: Rook's line and Play again becomes the primary", () => {
  const { container } = renderResult({ moments: { kind: "found", count: 0 } });
  expect(
    screen.getByText("No missed moments in this game. Nice."),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Look at them" }),
  ).not.toBeInTheDocument();
  expect(primaries(container)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Play again" })).toHaveClass(
    "ui-button--primary",
  );
});

test("while the game is read Rook thinks and only Play again is offered", () => {
  const { container } = renderResult({ moments: { kind: "reading" } });
  expect(screen.getByText("Reading your game…")).toBeInTheDocument();
  expect(container.querySelector('[data-mood="think"]')).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Look at them" }),
  ).not.toBeInTheDocument();
  expect(primaries(container)).toHaveLength(1);
});

test("sharing shows only for wins and there is no race button", () => {
  renderResult({ share: "Share this win" });
  expect(screen.getByText("Share this win")).toBeInTheDocument();
  expect(screen.queryByText(/Race friends/)).not.toBeInTheDocument();
  cleanup();
  renderResult({
    position: { ...won, outcome: "lost" },
    share: "Share this win",
  });
  expect(screen.queryByText("Share this win")).not.toBeInTheDocument();
});

test("finalPosition reads the last move and the result from the player's side", () => {
  const chess = new Chess();
  const moves = ["f3", "e5", "g4", "Qh4#"].map((san, index) => {
    const move = chess.move(san);
    return {
      ply: index + 1,
      san: move.san,
      uci: move.lan,
      fenAfter: move.after,
      playedAt: "2026-11-27T10:00:00.000Z",
    };
  });
  const game: GameRecord = {
    schemaVersion: 1,
    id: createGameId("fools-mate"),
    origin: { type: "tutor", mode: "rated", opponentElo: 1450 },
    initialFen: new Chess().fen(),
    moves,
    pgn: chess.pgn(),
    playerColor: "white",
    result: "black-win",
    createdAt: "2026-11-27T10:00:00.000Z",
    completedAt: "2026-11-27T10:00:00.000Z",
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    fingerprint: null,
  };
  expect(finalPosition(game)).toEqual({
    fen: chess.fen(),
    lastMoveUci: "d8h4",
    orientation: "white",
    outcome: "lost",
  });
  expect(finalPosition({ ...game, playerColor: "black" }).outcome).toBe("won");
  expect(finalPosition({ ...game, result: "draw" }).outcome).toBe("draw");
});
