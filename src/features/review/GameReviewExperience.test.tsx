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
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
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
  fireEvent.click(screen.getByRole("button", { name: "Play this move" }));
};

const playOriginalBest = (): void => {
  playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);
};

describe("GameReviewExperience transfer set", () => {
  it("starts with an exact board retry and hides the pattern until commitment", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} />);

    expect(
      screen.getByRole("heading", { name: "Play it differently." }),
    ).toBeVisible();
    expect(screen.queryByText(/Set 1 of/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/one-move threat/i)).not.toBeInTheDocument();
    expect(screen.queryByText("d2d4")).not.toBeInTheDocument();
    playOriginalBest();

    expect(screen.getByRole("heading", { name: "Good move" })).toBeVisible();
    expect(screen.getByText(/You played d4/)).toBeVisible();
    expect(
      screen.getByText(/immediate checks, captures, and direct threats/),
    ).toBeVisible();
  });

  it("gives deterministic correction for an incorrect legal original move", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} />);
    playBoardMove(/White bishop on f1/, /Empty c4, legal destination/);

    expect(
      screen.getByRole("heading", { name: "Try another move" }),
    ).toBeVisible();
    expect(screen.getByText(/You played Bc4/)).toBeVisible();
    expect(
      screen.getByText(/immediate forcing threat unanswered/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Undo and try again" }),
    ).toBeVisible();
  });

  it("accepts a verified alternative original move inside tolerance", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} />);
    playBoardMove(/White knight on b1/, /Empty c3, legal destination/);

    expect(screen.getByRole("heading", { name: "Good move" })).toBeVisible();
    expect(screen.getByText(/You played Nc3/)).toBeVisible();
    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText("35 centipawns")).toBeVisible();
  });

  it("runs close and unlabeled curated transfers before logging", () => {
    const fixture = reviewFixture();
    const onTrainingComplete = vi.fn<(log: ReviewTrainingLog) => void>();
    render(
      <GameReviewExperience
        {...fixture}
        onTrainingComplete={onTrainingComplete}
        now={() => "2026-11-24T12:00:00.000Z"}
      />,
    );
    playOriginalBest();
    fireEvent.click(screen.getByRole("button", { name: "Practice this idea" }));
    expect(
      screen.getByRole("heading", { name: "Spot it again?" }),
    ).toBeVisible();
    playBoardMove(/White queen on h5/, /Black pawn on f7, legal destination/);
    fireEvent.click(
      screen.getByRole("button", { name: "Practice without a hint" }),
    );

    expect(
      screen.getByRole("heading", { name: "One more position?" }),
    ).toBeVisible();
    expect(screen.queryByText(/one-move threat/i)).not.toBeInTheDocument();
    playBoardMove(/White rook on e1/, /Empty e8, legal destination/);
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));

    expect(
      screen.getByRole("heading", {
        name: "Take one cue into the next game",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/tested the idea in 2 new positions/),
    ).toBeVisible();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
    expect(onTrainingComplete).toHaveBeenCalledOnce();
  });

  it("lets the learner undo an incorrect similar-position move", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} />);
    playOriginalBest();
    fireEvent.click(screen.getByRole("button", { name: "Practice this idea" }));
    playBoardMove(/White queen on h5/, /Empty g5, legal destination/);

    expect(
      screen.getByRole("heading", { name: "Try another move" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Practice without a hint" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo and try again" }));
    expect(
      screen.getByRole("heading", { name: "Spot it again?" }),
    ).toBeVisible();
  });

  it("schedules both transfers when the curated pack does not support the theme", () => {
    const fixture = reviewFixture("calculation");
    render(
      <GameReviewExperience
        {...fixture}
        now={() => "2026-11-24T12:00:00.000Z"}
      />,
    );
    playOriginalBest();
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));

    expect(
      screen.getByText(/The next game will include one forcing decision/),
    ).toBeVisible();
  });

  it("keeps replay and engine data collapsed as secondary references", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} />);

    expect(
      screen.getByText("Replay the full game").closest("details"),
    ).not.toHaveAttribute("open");
    expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    playOriginalBest();
    expect(
      screen.getByText("Technical details").closest("details"),
    ).not.toHaveAttribute("open");
  });

  it("lets the learner stop after the rewound game without taking a quiz", () => {
    const fixture = reviewFixture();
    const onTrainingComplete = vi.fn<(log: ReviewTrainingLog) => void>();
    render(
      <GameReviewExperience
        {...fixture}
        onTrainingComplete={onTrainingComplete}
        now={() => "2026-11-24T12:00:00.000Z"}
      />,
    );
    playOriginalBest();

    expect(screen.getByRole("button", { name: "Finish review" })).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));

    expect(screen.getByText(/replayed the critical moment/)).toBeVisible();
    expect(onTrainingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        closeTransferScore: null,
        unlabeledTransferScore: null,
      }),
    );
  });

  it("plays through the coach line to show the opponent reply", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} />);
    playOriginalBest();

    fireEvent.click(screen.getByRole("button", { name: "Show coach move" }));
    expect(screen.getByText("Move 1 of 3")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Show the opponent's reply" }),
    );

    expect(screen.getByText(/Move 2 of 3 - opponent's reply/)).toBeVisible();
  });

  it("shows the opponent reply in an optional similar position", () => {
    const fixture = reviewFixture("development");
    render(<GameReviewExperience {...fixture} />);
    playOriginalBest();
    fireEvent.click(screen.getByRole("button", { name: "Practice this idea" }));
    playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);
    fireEvent.click(screen.getByRole("button", { name: "Show coach move" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show the opponent's reply" }),
    );

    expect(screen.getByText(/Move 2 of 3 - opponent's reply/)).toBeVisible();
  });

  it("calls Firebase hybrid coaching after a user gesture and shows provenance", async () => {
    const fixture = reviewFixture("development");
    const initializeDeviceModel = vi.fn(() => Promise.resolve());
    const provider: LessonContentProvider = {
      initializeDeviceModel,
      generate: () =>
        Promise.resolve({
          provenance: "on-device",
          value: {
            stepId: "explain-attempt",
            prompt: "What improved?",
            correctFeedback:
              "That move improves coordination before the position opens.",
            incorrectFeedback: "Try another move.",
            referencedMoves: [],
            referencedSquares: [],
            referencedNumbers: [],
          },
        }),
    };
    render(<GameReviewExperience {...fixture} coachProvider={provider} />);
    playOriginalBest();

    expect(initializeDeviceModel).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(
        "That move improves coordination before the position opens.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Feedback source: Gemini Nano on device"),
    ).toBeVisible();
  });
});
