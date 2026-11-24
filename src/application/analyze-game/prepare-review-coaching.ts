import {
  deterministicLessonContent,
  resolveLessonContent,
} from "../../domain/coaching/resolve-content";
import type {
  CoachingProvenance,
  LessonContentRequest,
} from "../../domain/coaching/types";
import { mapLearningTheme } from "../../domain/curriculum";
import type { MoveAttemptScore } from "../../domain/analysis/review-training";
import type { LearningTheme } from "../../domain/analysis/types";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";

export interface ReviewCoachingResult {
  readonly note: string;
  readonly provenance: CoachingProvenance;
  readonly validationFailure: string | null;
}

export const buildReviewCoachingRequest = (input: {
  readonly gameId: string;
  readonly fen: string;
  readonly theme: LearningTheme;
  readonly score: MoveAttemptScore;
  readonly deterministicExplanation: string;
}): LessonContentRequest => {
  const bestDestination = input.score.bestMoveUci.slice(2, 4);
  const acceptableMoves = [
    input.score.bestMoveUci,
    ...(input.score.accepted ? [input.score.attemptedMoveUci] : []),
  ].filter(
    (move, index, moves) => move.length > 0 && moves.indexOf(move) === index,
  );
  return {
    playbookId: `review.${input.theme}`,
    playbookVersion: "1.0.0",
    step: {
      id: "explain-attempt",
      kind: "explain",
      promptSlot: "review-feedback",
      fallbackPrompt: "Explain this move in plain language.",
      fallbackCorrectFeedback: input.deterministicExplanation,
      fallbackIncorrectFeedback: input.deterministicExplanation,
      answerKey: "acceptable-moves",
    },
    facts: {
      packetId: `${input.gameId}:review:${input.theme}`,
      theme: mapLearningTheme(input.theme),
      fen: input.fen,
      sourceGameIds: [input.gameId],
      endangeredSquare: bestDestination.length === 2 ? bestDestination : "none",
      threatenedMove: input.score.bestMoveUci,
      acceptableMoves,
      reasonCodes: [input.theme, input.score.accepted ? "accepted" : "retry"],
      transferMoves: [],
      allowedNumbers: [],
    },
  };
};

export const prepareReviewCoaching = async (input: {
  readonly request: LessonContentRequest;
  readonly accepted: boolean;
  readonly provider: LessonContentProvider | null;
  readonly signal: AbortSignal;
}): Promise<ReviewCoachingResult> => {
  if (input.provider === null) {
    const fallback = deterministicLessonContent(input.request);
    return {
      note: input.accepted
        ? fallback.content.correctFeedback
        : fallback.content.incorrectFeedback,
      provenance: fallback.provenance,
      validationFailure: fallback.validationFailure,
    };
  }

  try {
    const generated = await input.provider.generate(
      input.request,
      input.signal,
    );
    const resolved = resolveLessonContent({
      request: input.request,
      generated: generated.value,
      generatedProvenance: generated.provenance,
    });
    return {
      note: input.accepted
        ? resolved.content.correctFeedback
        : resolved.content.incorrectFeedback,
      provenance: resolved.provenance,
      validationFailure: resolved.validationFailure,
    };
  } catch {
    const fallback = deterministicLessonContent(input.request);
    return {
      note: input.accepted
        ? fallback.content.correctFeedback
        : fallback.content.incorrectFeedback,
      provenance: fallback.provenance,
      validationFailure: "provider-failed",
    };
  }
};
