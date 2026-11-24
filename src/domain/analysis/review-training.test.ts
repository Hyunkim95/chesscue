import { describe, expect, it } from "vitest";

import type { MoveAnalysisFact } from "./types";
import {
  buildReviewTrainingLog,
  scoreMoveAttempt,
  selectTransferFact,
} from "./review-training";

const fact: MoveAnalysisFact = {
  schemaVersion: 1,
  gameId: "game-1",
  ply: 3,
  fenBefore: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
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

describe("review training policy", () => {
  it("accepts the best move and a verified alternative inside tolerance", () => {
    expect(scoreMoveAttempt(fact, "d2d4")).toMatchObject({
      legal: true,
      accepted: true,
      evaluationGapCp: 0,
    });
    expect(scoreMoveAttempt(fact, "b1c3")).toMatchObject({
      legal: true,
      accepted: true,
      evaluationGapCp: 20,
    });
  });

  it("rejects a legal unverified move and an illegal move", () => {
    expect(scoreMoveAttempt(fact, "f1c4")).toMatchObject({
      legal: true,
      accepted: false,
      evaluationGapCp: null,
    });
    expect(scoreMoveAttempt(fact, "a1a8")).toMatchObject({
      legal: false,
      accepted: false,
    });
  });

  it("selects another validated same-theme fact for transfer", () => {
    const transfer = { ...fact, gameId: "game-2", ply: 7, impactCp: 90 };
    const otherTheme = {
      ...fact,
      gameId: "game-3",
      ply: 9,
      theme: "development" as const,
    };
    expect(selectTransferFact([fact, otherTheme, transfer], fact)).toEqual(
      transfer,
    );
    expect(selectTransferFact([fact, otherTheme], fact)).toBeNull();
  });

  it("logs deterministic score, hard spot, spacing, and reinforcement", () => {
    expect(
      buildReviewTrainingLog({
        theme: "one-move-threat",
        themeCorrect: true,
        primaryMoveAccepted: false,
        transferMoveAccepted: null,
        completedAt: "2026-11-24T12:00:00.000Z",
      }),
    ).toEqual({
      subject: "chess",
      theme: "one-move-threat",
      firstAttemptScore: 50,
      hardSpot: "Choosing a move that resolves the demand",
      dueReview: "2026-11-25",
      nextGameReinforcement:
        "The next game will emphasize forcing replies. Before choosing a plan, scan the opponent's checks, captures, and direct attacks.",
      transfer: "scheduled-next-game",
      completedAt: "2026-11-24T12:00:00.000Z",
    });
  });
});
