import type { ReviewReply } from "../../application/analyze-game/analyze-review-reply";
import type { AnalyzeReply } from "./GuidedMoveFeedback";
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
import { ReviewContinuation } from "./ReviewContinuation";
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
  const commit = screen.queryByRole("button", { name: "Play this move" });
  if (commit !== null) fireEvent.click(commit);
};

const playOriginalBest = (): void => {
  playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);
};

describe("GameReviewExperience transfer set", () => {
  it("opens on the critical position without revealing the engine move", () => {
    render(<GameReviewExperience {...reviewFixture()} />);
    expect(
      screen.getByRole("region", { name: "Rook commentary" }),
    ).toHaveTextContent("In your game you played Nf3 here.");
    expect(screen.getByText("Your move")).toBeVisible();
    expect(screen.queryByText("d2d4")).not.toBeInTheDocument();
  });

  it("replies to successive choices outside the recorded line and comments on the board", async () => {
    const analyzeReply = vi
      .fn()
      .mockResolvedValueOnce({ line: ["g8f6"], evaluationCpFromSideToMove: 0 })
      .mockResolvedValueOnce({ line: ["f6e4"], evaluationCpFromSideToMove: 0 });
    render(
      <GameReviewExperience {...reviewFixture()} analyzeReply={analyzeReply} />,
    );
    playBoardMove(/White bishop on f1/, /Empty c4, legal destination/);
    expect(
      await screen.findByRole("gridcell", {
        name: /Black knight on f6, last move ended here/,
      }),
    ).toBeVisible();
    playBoardMove(/White pawn on a2/, /Empty a3, legal destination/);
    expect(
      await screen.findByRole("gridcell", {
        name: /Black knight on e4, last move ended here/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Rook commentary" }),
    ).toHaveTextContent(
      "Your last move left the pawn on e4 under attack. After this capture you have no immediate recapture there. Black is a pawn ahead.",
    );
    expect(analyzeReply).toHaveBeenCalledTimes(2);
  });

  it("retains the position after a bad reply and retries from the same FEN", async () => {
    const analyzeReply = vi
      .fn()
      .mockResolvedValueOnce({ line: ["e1e8"], evaluationCpFromSideToMove: 0 })
      .mockResolvedValueOnce({ line: ["e5d4"], evaluationCpFromSideToMove: 0 });
    render(
      <GameReviewExperience {...reviewFixture()} analyzeReply={analyzeReply} />,
    );
    playOriginalBest();
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry CPU reply" }),
    );
    expect(
      await screen.findByRole("gridcell", {
        name: /Black pawn on d4, last move ended here/,
      }),
    ).toBeVisible();
    expect(analyzeReply.mock.calls[0]?.[0]).toEqual(
      analyzeReply.mock.calls[1]?.[0],
    );
  });

  it.each(["Undo my move", "Rewind again"])(
    "cancels a pending reply and keeps the first attempt when clicking %s",
    async (action) => {
      let answer: (reply: ReviewReply | null) => void = () => undefined;
      const analyzeReply = vi.fn<AnalyzeReply>(
        () =>
          new Promise<ReviewReply | null>((resolve) => {
            answer = resolve;
          }),
      );
      const onTrainingComplete = vi.fn();
      render(
        <GameReviewExperience
          {...reviewFixture()}
          analyzeReply={analyzeReply}
          onTrainingComplete={onTrainingComplete}
        />,
      );
      playOriginalBest();
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(analyzeReply.mock.calls[0]?.[1].aborted).toBe(true);
      answer({ line: ["e5d4"], evaluationCpFromSideToMove: 0 });
      await Promise.resolve();
      expect(
        within(screen.getByRole("grid", { name: /Training board/ })).getByRole(
          "gridcell",
          { name: /White pawn on d2/ },
        ),
      ).toBeVisible();
      playBoardMove(/White pawn on a2/, /Empty a3, legal destination/);
      fireEvent.click(screen.getByRole("button", { name: "Finish review" }));
      expect(onTrainingComplete).toHaveBeenCalledWith(
        expect.objectContaining({ originalAttemptScore: 100 }),
      );
      expect(analyzeReply.mock.calls[1]?.[1].aborted).toBe(true);
    },
  );

  it("brings back the queen-check choices after taking back the learner’s reply", async () => {
    const position = new Chess();
    for (const move of [
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bb5",
      "a6",
      "Bxc6",
      "dxc6",
      "Nxe5",
      "Qd4",
    ])
      position.move(move);
    const analyzeReply = vi
      .fn<AnalyzeReply>()
      .mockResolvedValueOnce({
        line: ["d4e4", "d1e2", "e4e2"],
        evaluationCpFromSideToMove: 58,
      })
      .mockResolvedValueOnce({
        line: ["e4e2", "e1e2"],
        evaluationCpFromSideToMove: 60,
      });
    render(
      <ReviewContinuation
        game={{
          ...reviewFixture().game,
          initialFen: position.fen(),
          moves: [],
        }}
        ply={1}
        analyzeReply={analyzeReply}
        onFirstMove={vi.fn()}
      >
        {null}
      </ReviewContinuation>,
    );
    playBoardMove(/White knight on e5/, /Empty f3, legal destination/);
    const commentary = within(
      screen.getByRole("region", { name: "Rook commentary" }),
    );
    expect(
      await commentary.findByText("You have 2 legal replies to this check."),
    ).toBeVisible();
    expect(
      commentary.getByText(/Qxe2\+ Kxe2, you lose castling rights/),
    ).toBeVisible();
    expect(
      commentary.getByText(/moving your king gives up castling/),
    ).toBeVisible();
    playBoardMove(/White queen on d1/, /Empty e2, legal destination/);
    await screen.findByRole("gridcell", {
      name: /Black queen on e2, last move ended here/,
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo my move" }));
    expect(
      commentary.getByText("You have 2 legal replies to this check."),
    ).toBeVisible();
    expect(analyzeReply).toHaveBeenCalledTimes(2);
  });

  it("lets Black underpromote and stops on a drawn board without a CPU search", () => {
    const { game } = reviewFixture();
    const analyzeReply = vi.fn();
    const onFirstMove = vi.fn();
    render(
      <ReviewContinuation
        game={{
          ...game,
          initialFen: "7K/8/8/8/8/8/p7/7k b - - 0 1",
          moves: [],
          playerColor: "black",
        }}
        ply={1}
        analyzeReply={analyzeReply}
        onFirstMove={onFirstMove}
      >
        {null}
      </ReviewContinuation>,
    );
    const board = within(
      screen.getByRole("grid", { name: "Training board, Black side" }),
    );
    fireEvent.click(board.getByRole("gridcell", { name: "Black pawn on a2" }));
    fireEvent.click(
      board.getByRole("gridcell", { name: /Empty a1, legal destination/ }),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Promote pawn" })).getByRole(
        "button",
        { name: "knight" },
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Draw.");
    expect(
      board.getByRole("gridcell", { name: /Black knight on a1/ }),
    ).toBeDisabled();
    expect(analyzeReply).not.toHaveBeenCalled();
    expect(onFirstMove).toHaveBeenCalledWith("a2a1n");
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
    fireEvent.click(
      screen.getByRole("button", { name: "Try a similar position" }),
    );
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
    fireEvent.click(
      screen.getByRole("button", { name: "Try a similar position" }),
    );
    playBoardMove(/White queen on h5/, /Empty g5, legal destination/);

    expect(screen.getByText("Try another move")).toBeVisible();
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

  it("shows the opponent reply in an optional similar position", () => {
    const fixture = reviewFixture("development");
    render(<GameReviewExperience {...fixture} />);
    playOriginalBest();
    fireEvent.click(
      screen.getByRole("button", { name: "Try a similar position" }),
    );
    playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);
    fireEvent.click(
      screen.getByRole("button", { name: "Show Stockfish move" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Play their reply" }));

    expect(screen.getByText("Move 2 of 3")).toBeVisible();
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
    fireEvent.click(screen.getByText("Why this matters"));
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
