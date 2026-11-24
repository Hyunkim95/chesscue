import { describe, expect, it } from "vitest";

import type { MoveAnalysisFact } from "../../domain/analysis/types";
import type { CompletedGameAnalysis } from "./analyze-completed-game";
import {
  commitCloseMove,
  commitOriginalMove,
  commitUnlabeledMove,
  completeAfterUnlabeled,
  continueAfterCloseFeedback,
  continueAfterOriginalFeedback,
  startReviewTraining,
} from "./review-training-session";

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
  ],
  analysisVersion: "stockfish-19-lite@1",
};

const analysis = (theme = fact.theme): CompletedGameAnalysis => {
  const themedFact = { ...fact, theme };
  return {
    facts: [themedFact],
    analyzedPlayerMoves: 1,
    moments: [
      {
        id: "moment-1",
        gameId: themedFact.gameId,
        ply: themedFact.ply,
        fenBefore: themedFact.fenBefore,
        playedMoveUci: themedFact.playedMoveUci,
        playedMoveSan: themedFact.playedMoveSan,
        candidateMoveUci: themedFact.candidates[0]?.uci ?? "",
        ...(themedFact.candidates[0]?.san === undefined
          ? {}
          : { candidateMoveSan: themedFact.candidates[0].san }),
        impactCp: themedFact.impactCp,
        theme: themedFact.theme,
        phase: themedFact.phase,
        analysisVersion: themedFact.analysisVersion,
        trace: {
          evaluationBeforeCp: themedFact.evaluationBeforeCp,
          evaluationAfterCp: themedFact.evaluationAfterCp,
          recurrence: themedFact.recurrence,
          curricularRelevance: themedFact.curricularRelevance,
        },
      },
    ],
  };
};

describe("review training session", () => {
  it("progresses deterministically through original, close, unlabeled, and log", () => {
    const started = startReviewTraining(analysis());
    expect(started?.stage).toBe("original-move");
    if (started === null) return;
    const original = commitOriginalMove(started, "d2d4");
    const close = continueAfterOriginalFeedback(
      original,
      "2026-11-24T12:00:00.000Z",
    );
    const closeScored = commitCloseMove(close, "h5f7");
    const unlabeled = continueAfterCloseFeedback(closeScored);
    const unlabeledScored = commitUnlabeledMove(unlabeled, "e1e8");
    const completed = completeAfterUnlabeled(
      unlabeledScored,
      "2026-11-24T12:00:00.000Z",
    );

    expect(completed.stage).toBe("complete");
    expect(completed.log).toMatchObject({
      firstAttemptScore: 100,
      originalAttemptScore: 100,
      closeTransferScore: 100,
      unlabeledTransferScore: 100,
      transfer: "completed",
    });
  });

  it("schedules transfer without inventing exercises for unsupported themes", () => {
    const started = startReviewTraining(analysis("calculation"));
    if (started === null) return;
    expect(started.closeExercise).toBeNull();
    expect(started.unlabeledExercise).toBeNull();
    const original = commitOriginalMove(started, "d2d4");
    const completed = continueAfterOriginalFeedback(
      original,
      "2026-11-24T12:00:00.000Z",
    );

    expect(completed.stage).toBe("complete");
    expect(completed.log).toMatchObject({
      firstAttemptScore: 100,
      closeTransferScore: null,
      unlabeledTransferScore: null,
      transfer: "scheduled-next-game",
    });
  });
});
