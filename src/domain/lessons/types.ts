import type { CurriculumTheme } from "../curriculum/types";

export const lessonStepKinds = [
  "recognize",
  "predict",
  "choose",
  "explain",
  "reflect",
  "apply",
] as const;
export type LessonStepKind = (typeof lessonStepKinds)[number];

export type LessonAnswerKey =
  | "endangered-square"
  | "threatened-move"
  | "acceptable-moves"
  | "reason-codes"
  | "transfer-moves";

export interface LessonStepDefinition {
  readonly id: string;
  readonly kind: LessonStepKind;
  readonly promptSlot: string;
  readonly fallbackPrompt: string;
  readonly fallbackCorrectFeedback: string;
  readonly fallbackIncorrectFeedback: string;
  readonly answerKey: LessonAnswerKey;
}

export interface LessonTrigger {
  readonly minimumEvidenceCount: number;
  readonly minimumConfidence: number;
}

export interface LessonReinforcement {
  readonly focus: CurriculumTheme;
  readonly preferredOpeningFamilies: readonly string[];
  readonly description: string;
}

export interface LessonPlaybook {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly theme: CurriculumTheme;
  readonly objective: string;
  readonly prerequisites: readonly string[];
  readonly trigger: LessonTrigger;
  readonly steps: readonly LessonStepDefinition[];
  readonly reinforcement: LessonReinforcement;
}

export interface LessonFactPacket {
  readonly packetId: string;
  readonly theme: CurriculumTheme;
  readonly fen: string;
  readonly sourceGameIds: readonly string[];
  readonly endangeredSquare: string;
  readonly threatenedMove: string;
  readonly acceptableMoves: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly transferMoves: readonly string[];
  readonly allowedNumbers: readonly number[];
}

export interface LessonSelectionEvidence {
  readonly theme: CurriculumTheme;
  readonly evidenceCount: number;
  readonly confidence: number;
  readonly priority: number;
  readonly factPacket: LessonFactPacket | null;
}

export interface LessonAttempt {
  readonly stepId: string;
  readonly answer: string;
  readonly correct: boolean;
  readonly attemptedAt: string;
}

export interface LessonMasteryEvidence {
  readonly theme: CurriculumTheme;
  readonly outcome: "success" | "weakness";
  readonly score: number;
  readonly confidence: number;
  readonly sourceLessonRunId: string;
}

export interface LessonRun {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly playbookId: string;
  readonly playbookVersion: string;
  readonly factPacketId: string;
  readonly sourceGameIds: readonly string[];
  readonly currentStepIndex: number;
  readonly status: "active" | "completed" | "remediate" | "stopped";
  readonly attempts: readonly LessonAttempt[];
  readonly incorrectAnswerCount: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly masteryEvidence: LessonMasteryEvidence | null;
  readonly reinforcement: LessonReinforcement;
  readonly stopReason: string | null;
}

export interface LessonSubmission {
  readonly answer: string;
  readonly submittedAt: string;
}

export interface LessonStepResult {
  readonly run: LessonRun;
  readonly correct: boolean;
  readonly feedbackKind: "correct" | "incorrect" | "remediate" | "completed";
}
