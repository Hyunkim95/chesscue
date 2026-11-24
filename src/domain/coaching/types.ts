import type { LessonFactPacket, LessonStepDefinition } from "../lessons/types";

export interface GeneratedLessonContent {
  readonly stepId: string;
  readonly prompt: string;
  readonly correctFeedback: string;
  readonly incorrectFeedback: string;
  readonly referencedMoves: readonly string[];
  readonly referencedSquares: readonly string[];
  readonly referencedNumbers: readonly number[];
}

export interface LessonContentRequest {
  readonly playbookId: string;
  readonly playbookVersion: string;
  readonly step: LessonStepDefinition;
  readonly facts: LessonFactPacket;
}

export type CoachingProvenance = "on-device" | "cloud" | "deterministic";

export interface ResolvedLessonContent {
  readonly content: GeneratedLessonContent;
  readonly provenance: CoachingProvenance;
  readonly validationFailure: string | null;
}
