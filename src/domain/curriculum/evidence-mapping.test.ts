import { describe, expect, it } from "vitest";

import type { ReviewTrainingLog } from "../analysis/review-training";
import type { MoveAnalysisFact } from "../analysis/types";
import { createGameId, type GameRecord } from "../game/types";
import {
  mapAnalysisFactToEvidence,
  mapReviewLogToEvidence,
  mapTutorGameOutcome,
} from "./evidence-mapping";

const fact: MoveAnalysisFact = {
  schemaVersion: 1,
  gameId: "game-1",
  ply: 3,
  fenBefore: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
  playedMoveUci: "g1f3",
  playedMoveSan: "Nf3",
  evaluationBeforeCp: 30,
  evaluationAfterCp: -90,
  impactCp: 120,
  phase: "opening",
  theme: "premature-central-exchange",
  recurrence: 1,
  curricularRelevance: 70,
  candidates: [
    {
      uci: "d2d4",
      san: "d4",
      evaluationCp: 30,
      principalVariation: ["d2d4"],
    },
  ],
  analysisVersion: "stockfish-19@1",
};

const game = (origin: GameRecord["origin"]): GameRecord => ({
  schemaVersion: 1,
  id: createGameId("game-1"),
  origin,
  initialFen: fact.fenBefore,
  moves: [],
  pgn: "",
  playerColor: "white",
  result: "white-win",
  createdAt: "2026-11-23T12:00:00.000Z",
  completedAt: "2026-11-24T12:00:00.000Z",
  curriculumVersion: "1.0.0",
  configurationVersion: "1.0.0",
  fingerprint: null,
});

describe("curriculum evidence mapping", () => {
  it("maps analysis themes and stable IDs deterministically", () => {
    expect(
      mapAnalysisFactToEvidence(fact, "2026-11-24T12:00:00.000Z", "tutor"),
    ).toMatchObject({
      id: "game-1:analysis:stockfish-19@1:3:premature-central-exchange",
      theme: "central-pawn-tension",
      outcome: "weakness",
      origin: "tutor",
    });
  });

  it("uses review score to produce success or weakness confidence", () => {
    const baseLog: ReviewTrainingLog = {
      subject: "chess",
      theme: "premature-central-exchange",
      firstAttemptScore: 100,
      hardSpot: "No hard spot observed in this set",
      dueReview: "2026-11-27",
      nextGameReinforcement: "Preserve central tension.",
      transfer: "completed",
      completedAt: "2026-11-24T12:10:00.000Z",
    };
    expect(
      mapReviewLogToEvidence("game-1", baseLog, "tutor", "opening"),
    ).toMatchObject({
      outcome: "success",
      confidence: 1,
    });
    expect(
      mapReviewLogToEvidence(
        "game-1",
        { ...baseLog, firstAttemptScore: 50 },
        "tutor",
        "opening",
      ),
    ).toMatchObject({ outcome: "weakness", confidence: 0.6 });
  });

  it("emits difficulty outcomes only for completed tutor games", () => {
    expect(mapTutorGameOutcome(game({ type: "tutor" }))).toMatchObject({
      score: 1,
    });
    expect(mapTutorGameOutcome(game({ type: "pgn-paste" }))).toBeNull();
  });
});
