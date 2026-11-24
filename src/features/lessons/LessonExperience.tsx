import { useEffect, useMemo, useState } from "react";

import { currentLessonContentRequest } from "../../application/run-lesson/lesson-session";
import { prepareLessonStep } from "../../application/run-lesson/prepare-step";
import { deterministicLessonContent } from "../../domain/coaching/resolve-content";
import type { ResolvedLessonContent } from "../../domain/coaching/types";
import {
  startLessonRun,
  submitLessonAnswer,
} from "../../domain/lessons/run-lesson";
import type {
  LessonFactPacket,
  LessonPlaybook,
  LessonRun,
} from "../../domain/lessons/types";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
import { LessonPanel, type LessonFeedback } from "./LessonPanel";

interface GeneratedStepContent {
  readonly stepId: string;
  readonly value: ResolvedLessonContent;
}

export interface LessonExperienceProps {
  readonly runId: string;
  readonly startedAt: string;
  readonly playbook: LessonPlaybook;
  readonly facts: LessonFactPacket;
  readonly provider?: LessonContentProvider | null;
  readonly now?: () => string;
  readonly onComplete?: ((run: LessonRun) => void) | null;
}

const systemNow = (): string => new Date().toISOString();

export function LessonExperience({
  runId,
  startedAt,
  playbook,
  facts,
  provider = null,
  now = systemNow,
  onComplete = null,
}: LessonExperienceProps) {
  const [run, setRun] = useState(() =>
    startLessonRun({ id: runId, playbook, facts, startedAt }),
  );
  const [feedback, setFeedback] = useState<LessonFeedback | null>(null);
  const [generated, setGenerated] = useState<GeneratedStepContent | null>(null);
  const [restartCount, setRestartCount] = useState(0);
  const request = useMemo(
    () => currentLessonContentRequest({ playbook, facts, run }),
    [facts, playbook, run],
  );

  useEffect(() => {
    if (provider === null || request === null) return;
    const controller = new AbortController();
    void prepareLessonStep({
      request,
      provider,
      signal: controller.signal,
    }).then((value) => {
      if (!controller.signal.aborted)
        setGenerated({ stepId: request.step.id, value });
    });
    return () => {
      controller.abort();
    };
  }, [provider, request]);

  const content = useMemo(() => {
    if (request === null) {
      const firstStep = playbook.steps[0];
      if (firstStep === undefined)
        throw new Error("Lesson playbook has no steps");
      return deterministicLessonContent({
        playbookId: playbook.id,
        playbookVersion: playbook.version,
        step: firstStep,
        facts,
      });
    }
    return generated?.stepId === request.step.id
      ? generated.value
      : deterministicLessonContent(request);
  }, [facts, generated, playbook, request]);

  const submit = (answer: string): void => {
    const result = submitLessonAnswer({
      run,
      playbook,
      facts,
      submission: { answer, submittedAt: now() },
    });
    setRun(result.run);
    setFeedback({
      kind: result.correct ? "correct" : "incorrect",
      message: result.correct
        ? content.content.correctFeedback
        : content.content.incorrectFeedback,
    });
    if (result.run.status === "completed") onComplete?.(result.run);
  };

  const restart = (): void => {
    const nextRestartCount = restartCount + 1;
    setRestartCount(nextRestartCount);
    setRun(
      startLessonRun({
        id: `${runId}-retry-${String(nextRestartCount)}`,
        playbook,
        facts,
        startedAt: now(),
      }),
    );
    setFeedback(null);
    setGenerated(null);
  };

  return (
    <LessonPanel
      playbook={playbook}
      facts={facts}
      run={run}
      content={content}
      feedback={feedback}
      onSubmit={submit}
      onContinue={() => {
        setFeedback(null);
      }}
      onRestart={restart}
    />
  );
}
