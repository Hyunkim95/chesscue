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
import type { MoveAnalysisFact } from "../../domain/analysis/types";
import {
  createGameId,
  type GameRecord,
  type RecordedMove,
} from "../../domain/game/types";
import { GameReviewExperience } from "./GameReviewExperience";

afterEach(cleanup);

function reviewFixture(withTransfer = true): {
  readonly game: GameRecord;
  readonly analysis: CompletedGameAnalysis;
} {
  const chess = new Chess();
  const recordedMoves: RecordedMove[] = [];
  const uciMoves = ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6"];
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
  const factOne: MoveAnalysisFact = {
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
    theme: "one-move-threat",
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
  const factTwo: MoveAnalysisFact = {
    ...factOne,
    ply: 5,
    fenBefore: fensBefore[4] ?? "",
    playedMoveUci: "f1b5",
    playedMoveSan: "Bb5",
    evaluationBeforeCp: 30,
    evaluationAfterCp: -90,
    impactCp: 120,
    candidates: [
      {
        uci: "f1c4",
        san: "Bc4",
        evaluationCp: 30,
        principalVariation: ["f1c4", "g8f6"],
      },
    ],
  };
  const facts = withTransfer ? [factOne, factTwo] : [factOne];
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
      facts,
      analyzedPlayerMoves: facts.length,
      moments: facts.map((fact) => ({
        id: `${fact.gameId}:${String(fact.ply)}:${fact.theme}`,
        gameId: fact.gameId,
        ply: fact.ply,
        fenBefore: fact.fenBefore,
        playedMoveUci: fact.playedMoveUci,
        playedMoveSan: fact.playedMoveSan,
        candidateMoveUci: fact.candidates[0]?.uci ?? "",
        ...(fact.candidates[0]?.san === undefined
          ? {}
          : { candidateMoveSan: fact.candidates[0].san }),
        impactCp: fact.impactCp,
        theme: fact.theme,
        phase: fact.phase,
        analysisVersion: fact.analysisVersion,
        trace: {
          evaluationBeforeCp: fact.evaluationBeforeCp,
          evaluationAfterCp: fact.evaluationAfterCp,
          recurrence: fact.recurrence,
          curricularRelevance: fact.curricularRelevance,
        },
      })),
    },
  };
}

const chooseCorrectTheme = (): void => {
  fireEvent.click(
    screen.getByLabelText("The opponent has an immediate forcing threat"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Lock this read" }));
};

const playBoardMove = (fromLabel: RegExp, toLabel: RegExp): void => {
  const board = screen.getByRole("grid", {
    name: "Training board, White side",
  });
  fireEvent.click(within(board).getByRole("gridcell", { name: fromLabel }));
  fireEvent.click(within(board).getByRole("gridcell", { name: toLabel }));
  fireEvent.click(screen.getByRole("button", { name: "Commit this move" }));
};

describe("GameReviewExperience active training", () => {
  it("requires retrieval before revealing the engine and accepts the best move", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);

    expect(
      screen.getByRole("heading", {
        name: "What matters most before you move?",
      }),
    ).toBeVisible();
    expect(screen.queryByText("d2d4")).not.toBeInTheDocument();
    chooseCorrectTheme();
    playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);

    expect(
      screen.getByRole("heading", { name: "Your move holds up" }),
    ).toBeVisible();
    expect(screen.getByText(/you identified the demand/)).toBeVisible();
  });

  it("gives deterministic correction for an incorrect legal move", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);
    chooseCorrectTheme();
    playBoardMove(/White bishop on f1/, /Empty c4, legal destination/);

    expect(
      screen.getByRole("heading", { name: "Resolve the demand first" }),
    ).toBeVisible();
    expect(screen.getByText(/does not resolve/)).toBeVisible();
  });

  it("accepts a verified alternative move inside the 35 centipawn tolerance", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);
    chooseCorrectTheme();
    playBoardMove(/White knight on b1/, /Empty c3, legal destination/);

    expect(
      screen.getByRole("heading", { name: "Your move holds up" }),
    ).toBeVisible();
    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText("35 centipawns")).toBeVisible();
  });

  it("runs a same-theme transfer attempt and logs the session", () => {
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
    chooseCorrectTheme();
    playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);
    fireEvent.click(
      screen.getByRole("button", { name: "Continue to transfer" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Apply the same idea in this new position",
      }),
    ).toBeVisible();
    playBoardMove(/White bishop on f1/, /Empty c4, legal destination/);
    fireEvent.click(screen.getByRole("button", { name: "Finish this set" }));

    expect(
      screen.getByRole("heading", { name: "This set programs the next one" }),
    ).toBeVisible();
    expect(
      screen.getByText("Completed with another verified position"),
    ).toBeVisible();
    expect(screen.getByText("100%")).toBeVisible();
    expect(onTrainingComplete).toHaveBeenCalledOnce();
  });

  it("explicitly schedules transfer for the next game when no validated fact exists", () => {
    const fixture = reviewFixture(false);
    render(
      <GameReviewExperience
        {...fixture}
        onPracticePosition={vi.fn()}
        now={() => "2026-11-24T12:00:00.000Z"}
      />,
    );
    chooseCorrectTheme();
    playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);
    fireEvent.click(
      screen.getByRole("button", { name: "Finish and log this set" }),
    );

    expect(
      screen.getByText("Scheduled explicitly for the next game"),
    ).toBeVisible();
    expect(
      screen.getByText(/The next game will emphasize forcing replies/),
    ).toBeVisible();
  });

  it("keeps replay and engine data collapsed as secondary references", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);

    expect(
      screen.getByText("Replay the full game").closest("details"),
    ).not.toHaveAttribute("open");
    expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    chooseCorrectTheme();
    playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);
    expect(
      screen.getByText("Technical details").closest("details"),
    ).not.toHaveAttribute("open");
  });
});
