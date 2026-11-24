import { describe, expect, it } from "vitest";

import type { MoveAnalysisFact } from "../../domain/analysis/types";
import type { CompletedGameAnalysis } from "./analyze-completed-game";
import {
  commitPrimaryMove,
  commitThemeRetrieval,
  commitTransferMove,
  completeAfterTransfer,
  continueAfterPrimaryFeedback,
  startReviewTraining,
} from "./review-training-session";

const first: MoveAnalysisFact = {
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
const second: MoveAnalysisFact = {
  ...first,
  gameId: "game-2",
  ply: 5,
  impactCp: 100,
  candidates: [
    {
      uci: "b1c3",
      san: "Nc3",
      evaluationCp: 20,
      principalVariation: ["b1c3"],
    },
  ],
};

const analysis = (
  facts: readonly MoveAnalysisFact[],
): CompletedGameAnalysis => ({
  facts,
  analyzedPlayerMoves: facts.length,
  moments: [
    {
      id: "moment-1",
      gameId: first.gameId,
      ply: first.ply,
      fenBefore: first.fenBefore,
      playedMoveUci: first.playedMoveUci,
      playedMoveSan: first.playedMoveSan,
      candidateMoveUci: first.candidates[0]?.uci ?? "",
      ...(first.candidates[0]?.san === undefined
        ? {}
        : { candidateMoveSan: first.candidates[0].san }),
      impactCp: first.impactCp,
      theme: first.theme,
      phase: first.phase,
      analysisVersion: first.analysisVersion,
      trace: {
        evaluationBeforeCp: first.evaluationBeforeCp,
        evaluationAfterCp: first.evaluationAfterCp,
        recurrence: first.recurrence,
        curricularRelevance: first.curricularRelevance,
      },
    },
  ],
});

describe("review training session", () => {
  it("progresses deterministically through retrieval, move, transfer, and log", () => {
    const started = startReviewTraining(analysis([first, second]));
    expect(started?.stage).toBe("theme-retrieval");
    if (started === null) return;
    const themed = commitThemeRetrieval(started, "one-move-threat");
    const primary = commitPrimaryMove(themed, "d2d4");
    const transfer = continueAfterPrimaryFeedback(
      primary,
      "2026-11-24T12:00:00.000Z",
    );
    const transferScored = commitTransferMove(transfer, "b1c3");
    const completed = completeAfterTransfer(
      transferScored,
      "2026-11-24T12:00:00.000Z",
    );

    expect(completed.stage).toBe("complete");
    expect(completed.log).toMatchObject({
      firstAttemptScore: 100,
      transfer: "completed",
      dueReview: "2026-11-27",
    });
  });

  it("schedules transfer in the next game when no same-theme fact exists", () => {
    const started = startReviewTraining(analysis([first]));
    if (started === null) return;
    const themed = commitThemeRetrieval(started, "development");
    const primary = commitPrimaryMove(themed, "d2d4");
    const completed = continueAfterPrimaryFeedback(
      primary,
      "2026-11-24T12:00:00.000Z",
    );

    expect(completed.stage).toBe("complete");
    expect(completed.log).toMatchObject({
      firstAttemptScore: 50,
      transfer: "scheduled-next-game",
      hardSpot: "Recognizing the position's main demand",
    });
  });
});
