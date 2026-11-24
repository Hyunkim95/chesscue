import { generatedLessonContentSchema } from "./schema";
import type {
  CoachingProvenance,
  GeneratedLessonContent,
  LessonContentRequest,
  ResolvedLessonContent,
} from "./types";

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

const fallbackContent = (
  request: LessonContentRequest,
): GeneratedLessonContent => ({
  stepId: request.step.id,
  prompt: request.step.fallbackPrompt,
  correctFeedback: request.step.fallbackCorrectFeedback,
  incorrectFeedback: request.step.fallbackIncorrectFeedback,
  referencedMoves: [],
  referencedSquares: [],
  referencedNumbers: [],
});

const allowedMoves = (request: LessonContentRequest): readonly string[] =>
  unique([
    request.facts.threatenedMove,
    ...request.facts.acceptableMoves,
    ...request.facts.transferMoves,
  ]).map((move) => move.toLowerCase());

const containsOnlyAllowedFacts = (
  content: GeneratedLessonContent,
  request: LessonContentRequest,
): string | null => {
  if (content.stepId !== request.step.id) return "step-id-mismatch";

  const moves = allowedMoves(request);
  if (
    content.referencedMoves.some((move) => !moves.includes(move.toLowerCase()))
  ) {
    return "unsupported-move-reference";
  }
  if (
    content.referencedSquares.some(
      (square) =>
        square.toLowerCase() !== request.facts.endangeredSquare.toLowerCase(),
    )
  ) {
    return "unsupported-square-reference";
  }
  if (
    content.referencedNumbers.some(
      (number) => !request.facts.allowedNumbers.includes(number),
    )
  ) {
    return "unsupported-number-reference";
  }

  const prose = `${content.prompt} ${content.correctFeedback} ${content.incorrectFeedback}`;
  const proseMoves = prose.match(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/gi) ?? [];
  if (proseMoves.some((move) => !moves.includes(move.toLowerCase()))) {
    return "unsupported-move-in-prose";
  }
  const proseSquares = prose.match(/\b[a-h][1-8]\b/gi) ?? [];
  if (
    proseSquares.some(
      (square) =>
        square.toLowerCase() !== request.facts.endangeredSquare.toLowerCase(),
    )
  ) {
    return "unsupported-square-in-prose";
  }
  const proseNumbers = (prose.match(/\b\d+(?:\.\d+)?\b/g) ?? []).map(Number);
  if (
    proseNumbers.some(
      (number) => !request.facts.allowedNumbers.includes(number),
    )
  ) {
    return "unsupported-number-in-prose";
  }
  return null;
};

export const resolveLessonContent = (input: {
  readonly request: LessonContentRequest;
  readonly generated: unknown;
  readonly generatedProvenance: Exclude<CoachingProvenance, "deterministic">;
}): ResolvedLessonContent => {
  const parsed = generatedLessonContentSchema.safeParse(input.generated);
  if (!parsed.success) {
    return {
      content: fallbackContent(input.request),
      provenance: "deterministic",
      validationFailure: "schema-invalid",
    };
  }

  const validationFailure = containsOnlyAllowedFacts(
    parsed.data,
    input.request,
  );
  if (validationFailure !== null) {
    return {
      content: fallbackContent(input.request),
      provenance: "deterministic",
      validationFailure,
    };
  }
  return {
    content: parsed.data,
    provenance: input.generatedProvenance,
    validationFailure: null,
  };
};

export const deterministicLessonContent = (
  request: LessonContentRequest,
): ResolvedLessonContent => ({
  content: fallbackContent(request),
  provenance: "deterministic",
  validationFailure: null,
});
