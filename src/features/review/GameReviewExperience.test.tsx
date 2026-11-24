import { Chess } from "chess.js";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompletedGameAnalysis } from "../../application/analyze-game/analyze-completed-game";
import type { ReviewTrainingLog } from "../../domain/analysis/review-training";
import type {
  LearningTheme,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import {
  createGameId,
  type GameRecord,
  type RecordedMove,
} from "../../domain/game/types";
import { GameReviewExperience } from "./GameReviewExperience";

afterEach(cleanup);

function reviewFixture(theme: LearningTheme = "one-move-threat"): {
  readonly game: GameRecord;
  readonly analysis: CompletedGameAnalysis;
} {
  const chess = new Chess();
  const recordedMoves: RecordedMove[] = [];
  const uciMoves = ["e2e4", "e7e5", "g1f3", "b8c6"];
  const fensBefore: string[] = [];
  for (const [index, uci] of uciMoves.entries()) {
    fensBefore.push(chess.fen());
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    recordedMoves.push({
      ply: index + 1,
      san: move.san,
      uci,
      fenAfter: move.after,
      playedAt: "2026-11-24T12:00:00.000Z",
    });
  }

  const gameId = createGameId("review-fixture");
  const fact: MoveAnalysisFact = {
    schemaVersion: 1,
    gameId,
    ply: 3,
    fenBefore: fensBefore[2] ?? "",
    playedMoveUci: "g1f3",
    playedMoveSan: "Nf3",
    evaluationBeforeCp: 25,
    evaluationAfterCp: -135,
    impactCp: 160,
    phase: "opening",
    theme,
    recurrence: 1,
    curricularRelevance: 70,
    candidates: [
      {
        uci: "d2d4",
        san: "d4",
        evaluationCp: 25,
        principalVariation: ["d2d4", "e5d4", "d1d4"],
      },
      {
        uci: "b1c3",
        san: "Nc3",
        evaluationCp: 5,
        principalVariation: ["b1c3", "g8f6"],
      },
    ],
    analysisVersion: "stockfish-19-lite@1",
  };
  return {
    game: {
      schemaVersion: 1,
      id: gameId,
      origin: { type: "tutor" },
      initialFen: new Chess().fen(),
      moves: recordedMoves,
      pgn: chess.pgn(),
      playerColor: "white",
      result: "white-win",
      createdAt: "2026-11-24T12:00:00.000Z",
      completedAt: "2026-11-24T12:10:00.000Z",
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      fingerprint: null,
    },
    analysis: {
      facts: [fact],
      analyzedPlayerMoves: 1,
      moments: [
        {
          id: `${gameId}:3:${theme}`,
          gameId,
          ply: 3,
          fenBefore: fact.fenBefore,
          playedMoveUci: fact.playedMoveUci,
          playedMoveSan: fact.playedMoveSan,
          candidateMoveUci: "d2d4",
          candidateMoveSan: "d4",
          impactCp: fact.impactCp,
          theme,
          phase: fact.phase,
          analysisVersion: fact.analysisVersion,
          trace: {
            evaluationBeforeCp: fact.evaluationBeforeCp,
            evaluationAfterCp: fact.evaluationAfterCp,
            recurrence: fact.recurrence,
            curricularRelevance: fact.curricularRelevance,
          },
        },
      ],
    },
  };
}

const playBoardMove = (fromLabel: RegExp, toLabel: RegExp): void => {
  const board = screen.getByRole("grid", {
    name: "Training board, White side",
  });
  fireEvent.click(within(board).getByRole("gridcell", { name: fromLabel }));
  fireEvent.click(within(board).getByRole("gridcell", { name: toLabel }));
  fireEvent.click(screen.getByRole("button", { name: "Commit this move" }));
};

const playOriginalBest = (): void => {
  playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);
};

describe("GameReviewExperience transfer set", () => {
  it("starts with an exact board retry and hides the pattern until commitment", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "What would you play now?" }),
    ).toBeVisible();
    expect(screen.queryByText(/one-move threat/i)).not.toBeInTheDocument();
    expect(screen.queryByText("d2d4")).not.toBeInTheDocument();
    playOriginalBest();

    expect(
      screen.getByRole("heading", { name: "one-move threat" }),
    ).toBeVisible();
    expect(
      screen.getByText(/immediate check, capture, or direct attack/),
    ).toBeVisible();
  });

  it("gives deterministic correction for an incorrect legal original move", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);
    playBoardMove(/White bishop on f1/, /Empty c4, legal destination/);

    expect(
      screen.getByText(/does not handle the one-move threat/),
    ).toBeVisible();
  });

  it("accepts a verified alternative original move inside tolerance", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);
    playBoardMove(/White knight on b1/, /Empty c3, legal destination/);

    expect(
      screen.getByText(/stays inside the verified tolerance/),
    ).toBeVisible();
    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText("35 centipawns")).toBeVisible();
  });

  it("runs close and unlabeled curated transfers before logging", () => {
    const fixture = reviewFixture();
    const onTrainingComplete = vi.fn<(log: ReviewTrainingLog) => void>();
    render(
      <GameReviewExperience
        {...fixture}
        onPracticePosition={vi.fn()}
        onTrainingComplete={onTrainingComplete}
        now={() => "2026-11-24T12:00:00.000Z"}
      />,
    );
    playOriginalBest();
    fireEvent.click(
      screen.getByRole("button", { name: "Try a close analogue" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Find the forcing move that ends the game.",
      }),
    ).toBeVisible();
    playBoardMove(/White queen on h5/, /Black pawn on f7, legal destination/);
    fireEvent.click(
      screen.getByRole("button", { name: "Try it without a label" }),
    );

    expect(
      screen.getByRole("heading", { name: "What would you play here?" }),
    ).toBeVisible();
    expect(screen.queryByText(/one-move threat/i)).not.toBeInTheDocument();
    playBoardMove(/White rook on e1/, /Empty e8, legal destination/);
    fireEvent.click(
      screen.getByRole("button", { name: "Finish and log this set" }),
    );

    expect(
      screen.getByRole("heading", { name: "This set programs the next one" }),
    ).toBeVisible();
    expect(screen.getAllByText("100%")).toHaveLength(4);
    expect(onTrainingComplete).toHaveBeenCalledOnce();
  });

  it("scores an incorrect close analogue without changing progression", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);
    playOriginalBest();
    fireEvent.click(
      screen.getByRole("button", { name: "Try a close analogue" }),
    );
    playBoardMove(/White queen on h5/, /Empty g5, legal destination/);

    expect(
      screen.getByText(/does not handle the one-move threat/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Try it without a label" }),
    ).toBeVisible();
  });

  it("schedules both transfers when the curated pack does not support the theme", () => {
    const fixture = reviewFixture("calculation");
    render(
      <GameReviewExperience
        {...fixture}
        onPracticePosition={vi.fn()}
        now={() => "2026-11-24T12:00:00.000Z"}
      />,
    );
    playOriginalBest();
    fireEvent.click(
      screen.getByRole("button", { name: "Finish and schedule transfer" }),
    );

    expect(screen.getAllByText("Scheduled for next game")).toHaveLength(2);
    expect(
      screen.getByText(/The next game will include one forcing decision/),
    ).toBeVisible();
  });

  it("keeps replay and engine data collapsed as secondary references", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);

    expect(
      screen.getByText("Replay the full game").closest("details"),
    ).not.toHaveAttribute("open");
    expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    playOriginalBest();
    expect(
      screen.getByText("Technical details").closest("details"),
    ).not.toHaveAttribute("open");
  });
});
