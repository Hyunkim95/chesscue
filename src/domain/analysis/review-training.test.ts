import { describe, expect, it } from "vitest";

import { transferExercisesForTheme } from "../transfer";
import type { MoveAnalysisFact } from "./types";
import {
  buildReviewTrainingLog,
  scoreMoveAttempt,
  scoreTransferAttempt,
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
  it("accepts the best original move and a verified alternative inside tolerance", () => {
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

  it("scores close and unlabeled exercises only against curated accepted moves", () => {
    const exercises = transferExercisesForTheme("one-move-threat");
    const close = exercises.find((exercise) => exercise.difficulty === "close");
    const unlabeled = exercises.find(
      (exercise) => exercise.difficulty === "unlabeled",
    );
    expect(close).toBeDefined();
    expect(unlabeled).toBeDefined();
    if (close === undefined || unlabeled === undefined) return;

    expect(scoreTransferAttempt(close, "h5f7")).toMatchObject({
      accepted: true,
    });
    expect(scoreTransferAttempt(close, "h5g5")).toMatchObject({
      accepted: false,
    });
    expect(scoreTransferAttempt(unlabeled, "e1e8")).toMatchObject({
      accepted: true,
    });
  });

  it("logs original, close, and unlabeled scores with spaced review", () => {
    expect(
      buildReviewTrainingLog({
        theme: "one-move-threat",
        originalMoveAccepted: true,
        closeMoveAccepted: false,
        unlabeledMoveAccepted: true,
        completedAt: "2026-11-24T12:00:00.000Z",
      }),
    ).toMatchObject({
      firstAttemptScore: 67,
      originalAttemptScore: 100,
      closeTransferScore: 0,
      unlabeledTransferScore: 100,
      hardSpot: "Applying the pattern to a close analogue",
      dueReview: "2026-11-25",
      transfer: "completed",
    });
  });

  it("does not penalize unavailable transfer exercises", () => {
    expect(
      buildReviewTrainingLog({
        theme: "calculation",
        originalMoveAccepted: true,
        closeMoveAccepted: null,
        unlabeledMoveAccepted: null,
        completedAt: "2026-11-24T12:00:00.000Z",
      }),
    ).toMatchObject({
      firstAttemptScore: 100,
      closeTransferScore: null,
      unlabeledTransferScore: null,
      transfer: "scheduled-next-game",
      dueReview: "2026-11-27",
    });
  });
});
