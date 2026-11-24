import {
  deterministicLessonContent,
  resolveLessonContent,
} from "../../domain/coaching/resolve-content";
import type {
  LessonContentRequest,
  ResolvedLessonContent,
} from "../../domain/coaching/types";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";

export const prepareLessonStep = async (input: {
  readonly request: LessonContentRequest;
  readonly provider: LessonContentProvider | null;
  readonly signal: AbortSignal;
}): Promise<ResolvedLessonContent> => {
  if (input.provider === null) return deterministicLessonContent(input.request);

  try {
    const generated = await input.provider.generate(
      input.request,
      input.signal,
    );
    return resolveLessonContent({
      request: input.request,
      generated: generated.value,
      generatedProvenance: generated.provenance,
    });
  } catch {
    return deterministicLessonContent(input.request);
  }
};
