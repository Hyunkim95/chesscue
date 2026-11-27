import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Chess } from "chess.js";
import { afterEach, expect, test, vi } from "vitest";

import type { StoryFrame } from "../../domain/analysis/line-storyboard";
import type { GoodMove } from "../../domain/curriculum/good-moves";
import { createGameId, type GameRecord } from "../../domain/game/types";
import { finalPosition, type FinalPosition } from "./final-position";
import {
  ResultScreen,
  type ResultMoments,
  type ResultOpening,
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
  opening,
  goodMoves,
}: {
  position?: FinalPosition;
  rating?: ResultRating;
  moments?: ResultMoments;
  share?: string;
  opening?: ResultOpening;
  goodMoves?: readonly GoodMove[];
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
      opening={opening}
      goodMoves={goodMoves}
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

const italian: ResultOpening = {
  name: "Italian Game: Giuoco Piano",
  summary: "You left the book on move 4",
  frames: [
    {
      fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
      moveUci: "f8c5",
      by: "learner",
      arrows: [
        { from: "f3", to: "g5", kind: "tried" },
        { from: "c2", to: "c3", kind: "move" },
      ],
      outlines: [],
      control: [],
      caption: "You left the book with Ng5. The usual move is c3.",
    },
    {
      fen: "r1bqk1nr/pppp1ppp/2n5/2b1p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4",
      moveUci: "f3g5",
      by: "learner",
      arrows: [],
      outlines: [{ square: "b1", tone: "coral" }],
      control: [],
      caption: "Ng5 moves the knight a second time.",
    },
  ],
};

test("the opening row steps through its frames on the board and resets", () => {
  renderResult({ opening: italian });
  fireEvent.click(
    screen.getByRole("button", {
      name: /Opening\s*Italian Game: Giuoco Piano\s*You left the book on move 4/,
    }),
  );
  expect(
    screen.getByRole("grid", { name: "Opening, step 1 of 2" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("You left the book with Ng5. The usual move is c3."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Ng5 moves the knight a second time.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "↺ Reset" }));
  expect(screen.getByRole("grid", { name: "Final position" })).toBeVisible();
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    "Rook found 2 moments in this game",
  );
});

test("there is no opening row without frames", () => {
  renderResult({ opening: { ...italian, frames: [] } });
  expect(screen.queryByText("Italian Game: Giuoco Piano")).toBeNull();
});

// The Opera Game: 14. Rd1 was the only move, and 17. Rd8# mated.
const before = "4kb1r/p2rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2K4R w k - 0 14";
const after = "4kb1r/p2rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR4 b k - 1 14";
const start: StoryFrame = {
  fen: before,
  moveUci: "d8d7",
  by: "rook",
  arrows: [],
  outlines: [],
  control: [],
  caption: "Move 14, White to move. Watch what you played.",
};
const rd1: GoodMove = {
  gameId: "opera",
  ply: 27,
  kind: "only-move",
  san: "Rd1",
  moveLabel: "Move 14",
  frames: [
    start,
    {
      fen: after,
      moveUci: "h1d1",
      by: "learner",
      arrows: [{ from: "h1", to: "d1", kind: "preview" }],
      outlines: [],
      control: [],
      caption: "Rd1 aims at d7 and adds control of d4, d5 and d3.",
    },
    {
      fen: after,
      moveUci: "",
      by: "learner",
      arrows: [{ from: "h1", to: "d1", kind: "move" }],
      outlines: [{ square: "d1", tone: "jade" }],
      control: [],
      caption: "Rd1 was the only move that keeps your advantage.",
    },
  ],
};
const rd8: GoodMove = {
  ...rd1,
  ply: 33,
  kind: "tactic",
  san: "Rd8#",
  moveLabel: "Move 17",
  frames: [
    {
      ...start,
      fen: "1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 17",
      caption: "Move 17, White to move. Watch what you played.",
    },
  ],
};

test("good moves: a quiet line under the moments that replays each one", () => {
  const { container, onLookAtMoments } = renderResult({
    goodMoves: [rd1, rd8],
  });
  expect(primaries(container)).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "· and 2 things you did well" }),
  );
  expect(onLookAtMoments).not.toHaveBeenCalled();
  expect(
    screen.getByRole("grid", { name: "Good move 1 of 2, step 1 of 3" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Good move 1 of 2 · Move 14, Rd1")).toBeVisible();
  expect(
    screen.getByText("Move 14, White to move. Watch what you played."),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByText("Rd1 was the only move that keeps your advantage."),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  // Reset goes back to the position before the move.
  fireEvent.click(screen.getByRole("button", { name: "↺ Reset" }));
  expect(
    screen.getByRole("grid", { name: "Good move 1 of 2, step 1 of 3" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next good move ›" }));
  expect(
    screen.getByRole("grid", { name: "Good move 2 of 2, step 1 of 1" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Next good move ›" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.getByRole("grid", { name: "Final position" })).toBeVisible();
});

test("one good move is singular", () => {
  renderResult({ goodMoves: [rd1] });
  expect(
    screen.getByRole("button", { name: "· and 1 thing you did well" }),
  ).toBeVisible();
});

test("without moments, the good moves lead and Look at them replays them", () => {
  const { container, onLookAtMoments } = renderResult({
    moments: { kind: "found", count: 0 },
    goodMoves: [rd1, rd8],
  });
  expect(
    screen.getByRole("heading", {
      name: "Rook found 2 things you did well in this game",
    }),
  ).toBeInTheDocument();
  expect(primaries(container)).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Look at them" }));
  expect(onLookAtMoments).not.toHaveBeenCalled();
  expect(
    screen.getByRole("grid", { name: "Good move 1 of 2, step 1 of 3" }),
  ).toBeInTheDocument();
});

test("good moves wait until Rook has read the game", () => {
  renderResult({ moments: { kind: "reading" }, goodMoves: [rd1] });
  expect(screen.queryByText(/you did well/)).not.toBeInTheDocument();
});
