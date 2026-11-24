import { Chess } from "chess.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CompletedGameAnalysis } from "../../application/analyze-game/analyze-completed-game";
import type { MoveAnalysisFact } from "../../domain/analysis/types";
import {
  createGameId,
  type GameRecord,
  type RecordedMove,
} from "../../domain/game/types";
import { GameReviewExperience } from "./GameReviewExperience";

afterEach(cleanup);

function reviewFixture(): {
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
    theme: "development",
    candidates: [
      {
        uci: "f1c4",
        san: "Bc4",
        evaluationCp: 30,
        principalVariation: ["f1c4", "g8f6"],
      },
    ],
  };
  const facts = [factOne, factTwo];
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
      analyzedPlayerMoves: 2,
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

describe("GameReviewExperience", () => {
  it("auto-jumps to the position before the selected learner move", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "After Black's move 1",
    );
    expect(screen.getByRole("gridcell", { name: "Empty f3" })).toBeVisible();
    expect(screen.getByText("Moment 1 of 2")).toBeVisible();
  });

  it("steps through the learner line and verified better continuation", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Play next move" }));
    expect(
      screen.getByRole("gridcell", {
        name: /White knight on f3, last move ended here/,
      }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Comparison step 1 of 3",
    );

    fireEvent.click(screen.getByRole("tab", { name: /^Better move/ }));
    fireEvent.click(screen.getByRole("button", { name: "Play next move" }));
    expect(
      screen.getByRole("gridcell", {
        name: /White pawn on d4, last move ended here/,
      }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Comparison step 1 of 3",
    );
  });

  it("scrubs the full game and navigates between moments", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} onPracticePosition={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Replay the full game"), {
      target: { value: "6" },
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "After Black's move 3",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next moment" }));
    expect(screen.getByText("Moment 2 of 2")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Move 3" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "After Black's move 2",
    );
  });

  it("keeps engine details collapsed and emits a practice request", () => {
    const fixture = reviewFixture();
    const onPracticePosition = vi.fn();
    render(
      <GameReviewExperience
        {...fixture}
        onPracticePosition={onPracticePosition}
      />,
    );

    const details = screen.getByText("Technical details").closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Technical details"));
    expect(screen.getByText("stockfish-19-lite@1")).toBeVisible();
    expect(screen.getByText("25 to -135 centipawns")).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Practice this pattern" }),
    );
    expect(onPracticePosition).toHaveBeenCalledWith({
      gameId: "review-fixture",
      momentId: "review-fixture:3:one-move-threat",
      fen: fixture.analysis.moments[0]?.fenBefore,
      theme: "one-move-threat",
    });
  });
});
