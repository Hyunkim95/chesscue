import { describe, expect, it } from "vitest";

import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
import {
  buildReviewCoachingRequest,
  prepareReviewCoaching,
} from "./prepare-review-coaching";

const request = buildReviewCoachingRequest({
  gameId: "game-1",
  fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
  theme: "development",
  score: {
    legal: true,
    accepted: true,
    attemptedMoveUci: "g1f3",
    bestMoveUci: "g1f3",
    evaluationGapCp: 0,
    comparison: "",
  },
  deterministicExplanation:
    "You played Nf3. It improves piece coordination or control of the center.",
});

describe("review coaching preparation", () => {
  it("builds a bounded request from verified review facts", () => {
    expect(request).toMatchObject({
      playbookId: "review.development",
      step: { id: "explain-attempt", kind: "explain" },
      facts: {
        theme: "development",
        sourceGameIds: ["game-1"],
        kind: "review",
        bestMove: "g1f3",
        playedMove: "g1f3",
        acceptableMoves: ["g1f3"],
        allowedNumbers: [],
      },
    });
  });

  it("accepts validated Firebase AI Logic wording and records provenance", async () => {
    const provider: LessonContentProvider = {
      generate: () =>
        Promise.resolve({
          provenance: "on-device",
          value: {
            stepId: "explain-attempt",
            prompt: "Which options did you consider?",
            correctFeedback:
              "Nf3 develops a piece while keeping the position coordinated.",
            incorrectFeedback: "Try the move again.",
            referencedMoves: [],
            referencedSquares: [],
            referencedNumbers: [],
          },
        }),
    };

    await expect(
      prepareReviewCoaching({
        request,
        accepted: true,
        provider,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      note:
        request.step.fallbackCorrectFeedback +
        " Which options did you consider?",
      provenance: "on-device",
      validationFailure: null,
    });
  });

  it("falls back when generated facts are not allowed", async () => {
    const provider: LessonContentProvider = {
      generate: () =>
        Promise.resolve({
          provenance: "cloud",
          value: {
            stepId: "explain-attempt",
            prompt: "Play e2e4.",
            correctFeedback: "e2e4 wins immediately.",
            incorrectFeedback: "Try again.",
            referencedMoves: ["e2e4"],
            referencedSquares: [],
            referencedNumbers: [],
          },
        }),
    };

    await expect(
      prepareReviewCoaching({
        request,
        accepted: true,
        provider,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      note: "You played Nf3. It improves piece coordination or control of the center.",
      provenance: "deterministic",
      validationFailure: "unsupported-move-reference",
    });
  });
});
