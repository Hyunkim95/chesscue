import type { LessonContentRequest } from "../../domain/coaching/types";
import { lessonPlaybookRegistry } from "../../domain/lessons/registry";
import { startLessonRun } from "../../domain/lessons/run-lesson";
import { selectLessonPlaybook } from "../../domain/lessons/select-playbook";
import type {
  LessonFactPacket,
  LessonPlaybook,
  LessonRun,
  LessonSelectionEvidence,
} from "../../domain/lessons/types";

export type StartLessonResult =
  | { readonly status: "not-eligible" }
  | {
      readonly status: "started";
      readonly playbook: LessonPlaybook;
      readonly facts: LessonFactPacket;
      readonly run: LessonRun;
    };

export const startSelectedLesson = (input: {
  readonly runId: string;
  readonly startedAt: string;
  readonly evidence: readonly LessonSelectionEvidence[];
  readonly registry?: readonly LessonPlaybook[];
}): StartLessonResult => {
  const selected = selectLessonPlaybook(
    input.registry ?? lessonPlaybookRegistry,
    input.evidence,
  );
  if (selected === null) return { status: "not-eligible" };

  return {
    status: "started",
    playbook: selected.playbook,
    facts: selected.factPacket,
    run: startLessonRun({
      id: input.runId,
      playbook: selected.playbook,
      facts: selected.factPacket,
      startedAt: input.startedAt,
    }),
  };
};

export const currentLessonContentRequest = (input: {
  readonly playbook: LessonPlaybook;
  readonly facts: LessonFactPacket;
  readonly run: LessonRun;
}): LessonContentRequest | null => {
  if (input.run.status !== "active") return null;
  const step = input.playbook.steps[input.run.currentStepIndex];
  if (step === undefined) return null;
  return {
    playbookId: input.playbook.id,
    playbookVersion: input.playbook.version,
    step,
    facts: input.facts,
  };
};
