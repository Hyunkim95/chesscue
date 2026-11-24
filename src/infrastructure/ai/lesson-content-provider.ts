import type { LessonContentRequest } from "../../domain/coaching/types";

export interface LessonContentProviderResult {
  readonly value: unknown;
  readonly provenance: "on-device" | "cloud";
}

export interface LessonContentProvider {
  generate(
    request: LessonContentRequest,
    signal: AbortSignal,
  ): Promise<LessonContentProviderResult>;
}

export class DeterministicOnlyProvider implements LessonContentProvider {
  async generate(
    _request: LessonContentRequest,
    signal: AbortSignal,
  ): Promise<LessonContentProviderResult> {
    if (signal.aborted)
      throw new DOMException(
        "Lesson content request was cancelled",
        "AbortError",
      );
    return Promise.reject(new Error("Generated lesson content is unavailable"));
  }
}
