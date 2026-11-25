import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import type { CompletedGameAnalysis } from "../analyze-game/analyze-completed-game";
import type { ReviewTrainingLog } from "../../domain/analysis/review-training";
import type {
  LearningTheme,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import type { CurriculumEvidence } from "../../domain/curriculum/types";
import {
  createGameId,
  type GameRecord,
  type RecordedMove,
} from "../../domain/game/types";
import {
  recomputeAdaptiveLoop,
  type CompletedTutorGameInput,
} from "./recompute-adaptive-loop";

const makeCompletedGame = (
  id: string,
  day: number,
  result: GameRecord["result"] = "white-win",
): GameRecord => {
  const chess = new Chess();
  const moves: RecordedMove[] = [];
  for (const [index, uci] of ["e2e4", "e7e5", "g1f3"].entries()) {
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    moves.push({
      ply: index + 1,
      san: move.san,
      uci,
      fenAfter: move.after,
      playedAt: `2026-11-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    });
  }
  return {
    schemaVersion: 1,
    id: createGameId(id),
    origin: { type: "tutor" },
    initialFen: new Chess().fen(),
    moves,
    pgn: chess.pgn(),
    playerColor: "white",
    result,
    createdAt: `2026-11-${String(day).padStart(2, "0")}T11:00:00.000Z`,
    completedAt: `2026-11-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    fingerprint: null,
  };
};

const makeFact = (
  game: GameRecord,
  theme: LearningTheme,
): MoveAnalysisFact => ({
  schemaVersion: 1,
  gameId: game.id,
  ply: 3,
  fenBefore: game.moves[1]?.fenAfter ?? "",
  playedMoveUci: "g1f3",
  playedMoveSan: "Nf3",
  evaluationBeforeCp: 30,
  evaluationAfterCp: -90,
  impactCp: 120,
  phase: "opening",
  theme,
  recurrence: 1,
  curricularRelevance: 80,
  candidates: [
    {
      uci: "d2d4",
      san: "d4",
      evaluationCp: 30,
      principalVariation: ["d2d4"],
    },
  ],
  analysisVersion: "stockfish-19@1",
});

const makeInput = (
  id: string,
  day: number,
  theme: LearningTheme,
  reviewLog: ReviewTrainingLog | null = null,
): CompletedTutorGameInput => {
  const game = makeCompletedGame(id, day);
  const fact = makeFact(game, theme);
  const analysis: CompletedGameAnalysis = {
    facts: [fact],
    moments: [],
    analyzedPlayerMoves: 1,
  };
  return { game, analysis, reviewLog };
};

const reviewLog = (
  theme: LearningTheme,
  score: number,
  completedAt: string,
): ReviewTrainingLog => ({
  subject: "chess",
  theme,
  firstAttemptScore: score,
  hardSpot:
    score >= 80 ? "No hard spot observed in this set" : "Choosing the move",
  dueReview: "2026-11-25",
  nextGameReinforcement: "Repeat the verified pattern.",
  transfer: "completed",
  completedAt,
});

const recompute = (
  completedTutorGames: readonly CompletedTutorGameInput[],
  importedEvidence: readonly CurriculumEvidence[] = [],
) =>
  recomputeAdaptiveLoop({
    completedTutorGames,
    importedEvidence,
    initialTargetElo: 1200,
    curriculumVersion: "1.0.0",
    computedAt: "2026-11-24T18:00:00.000Z",
  });

describe("adaptive-loop orchestration", () => {
  it("accepts only completed games with validated traceable facts", () => {
    const valid = makeInput("valid", 20, "king-safety");
    const validFact = valid.analysis.facts[0];
    if (validFact === undefined) throw new Error("Expected one analysis fact");
    const invalidFact: MoveAnalysisFact = {
      ...validFact,
      playedMoveUci: "a1a8",
    };
    const invalid: CompletedTutorGameInput = {
      ...valid,
      analysis: {
        ...valid.analysis,
        facts: [invalidFact],
      },
    };
    const result = recompute([invalid]);

    expect(result.evidence).toEqual([]);
    expect(result.tutorGameOutcomes).toEqual([]);
    expect(result.issues).toMatchObject([{ code: "invalid-analysis-fact" }]);
  });

  it("uses coached games as training evidence and excludes them from Elo outcomes", () => {
    const rated = makeInput("rated", 20, "king-safety");
    const converted = makeInput("converted", 21, "development");
    const coached = makeInput("coached", 22, "hanging-piece");
    const result = recompute([
      rated,
      { ...converted, game: { ...converted.game, coachJoinedAtPly: 2 } },
      {
        ...coached,
        game: { ...coached.game, origin: { type: "tutor", mode: "coached" } },
      },
    ]);

    expect(result.tutorGameOutcomes.map(({ id }) => id)).toEqual([
      rated.game.id,
    ]);
    expect(result.contributingGames.tutor).toBe(3);
  });

  it("uses review outcomes to emit deterministic success and weakness evidence", () => {
    const success = makeInput(
      "review-success",
      20,
      "king-safety",
      reviewLog("king-safety", 100, "2026-11-20T13:00:00.000Z"),
    );
    const weakness = makeInput(
      "review-weakness",
      21,
      "king-safety",
      reviewLog("king-safety", 50, "2026-11-21T13:00:00.000Z"),
    );
    const result = recompute([weakness, success]);
    const reviewEvidence = result.evidence.filter((item) =>
      item.id.includes(":review:"),
    );

    expect(reviewEvidence.map((item) => item.outcome)).toEqual([
      "success",
      "weakness",
    ]);
    expect(reviewEvidence.map((item) => item.confidence)).toEqual([1, 0.6]);
  });

  it("deduplicates stable evidence and is invariant to input order", () => {
    const first = makeInput("same", 20, "king-safety");
    const forward = recompute([first, first]);
    const reverse = recompute([first, first].toReversed());

    expect(forward).toEqual(reverse);
    expect(forward.evidence).toHaveLength(1);
    expect(forward.tutorGameOutcomes).toHaveLength(1);
    expect(forward.acceptedGameIds).toEqual(["same"]);
  });

  it("counts only distinct games that supplied card evidence", () => {
    const tutor = makeInput(
      "with-review",
      20,
      "king-safety",
      reviewLog("king-safety", 85, "2026-11-21T12:00:00Z"),
    );
    const empty = {
      ...makeInput("empty", 21, "king-safety"),
      analysis: { facts: [], moments: [], analyzedPlayerMoves: 0 },
    };
    const result = recompute([empty, tutor, tutor]);
    expect(result.acceptedGameIds).toContain("empty");
    expect(result.evidence).toHaveLength(2);
    expect(result.contributingGames).toEqual({ import: 0, tutor: 1 });
  });
  it("lets imported evidence change focus without changing CPU Elo", () => {
    const tutor = makeInput("tutor-one", 20, "king-safety");
    const imported: CurriculumEvidence[] = [1, 2, 3].map((number) => ({
      id: `import-${String(number)}`,
      theme: "hanging-piece",
      origin: "import",
      outcome: "weakness",
      impact: 1,
      confidence: 0.95,
      occurredAt: `2026-11-${String(20 + number).padStart(2, "0")}T12:00:00.000Z`,
      phase: "middlegame",
      sourceGameId: `imported-game-${String(number)}`,
    }));
    const withoutImport = recompute([tutor]);
    const withImport = recompute([tutor], imported);

    expect(withImport.contributingGames).toEqual({ import: 3, tutor: 1 });
    expect(withImport.profile.nextGame.focus).toBe("hanging-piece");
    expect(withImport.profile.strength.targetElo).toBe(
      withoutImport.profile.strength.targetElo,
    );
    expect(withImport.tutorGameOutcomes).toEqual(
      withoutImport.tutorGameOutcomes,
    );
  });

  it("changes focus across a scripted three-game window and moves Elo by only 50", () => {
    const first = makeInput("game-1", 20, "king-safety");
    const second = makeInput("game-2", 21, "hanging-piece");
    const third = makeInput("game-3", 22, "hanging-piece");
    const afterOne = recompute([first]);
    const afterThree = recompute([third, first, second]);

    expect(afterOne.profile.nextGame.focus).toBe("king-safety");
    expect(afterOne.profile.strength.targetElo).toBe(1200);
    expect(afterThree.profile.nextGame.focus).toBe("hanging-piece");
    expect(afterThree.profile.strength.targetElo).toBe(1250);
    expect(
      afterThree.profile.strength.targetElo -
        afterOne.profile.strength.targetElo,
    ).toBe(50);
  });
});
