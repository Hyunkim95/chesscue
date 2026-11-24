import { useId, useState, type SyntheticEvent } from "react";

import type { ResolvedLessonContent } from "../../domain/coaching/types";
import type { LessonPlaybook, LessonRun } from "../../domain/lessons/types";

export interface LessonPanelProps {
  readonly playbook: LessonPlaybook;
  readonly run: LessonRun;
  readonly content: ResolvedLessonContent;
  readonly onSubmit: (answer: string) => void;
}

export function LessonPanel({
  playbook,
  run,
  content,
  onSubmit,
}: LessonPanelProps) {
  const answerId = useId();
  const [answer, setAnswer] = useState("");
  const step = playbook.steps[run.currentStepIndex];

  if (run.status !== "active" || step === undefined) {
    return (
      <section aria-live="polite">
        <h2>
          {run.status === "completed" ? "Lesson complete" : "Lesson paused"}
        </h2>
        <p>
          {run.status === "completed"
            ? "Your result is saved and the next game will reinforce this idea."
            : "This lesson needs remediation before it can continue."}
        </p>
      </section>
    );
  }

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = answer.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
    setAnswer("");
  };

  return (
    <section aria-labelledby="lesson-title">
      <p>
        Step {run.currentStepIndex + 1} of {playbook.steps.length}: {step.kind}
      </p>
      <h2 id="lesson-title">{playbook.objective}</h2>
      <p>{content.content.prompt}</p>
      <form onSubmit={submit}>
        <label htmlFor={answerId}>Your answer</label>
        <input
          id={answerId}
          value={answer}
          onChange={(event) => {
            setAnswer(event.currentTarget.value);
          }}
          autoComplete="off"
        />
        <button type="submit">Check answer</button>
      </form>
      <p aria-label="Content source">
        {content.provenance === "deterministic"
          ? "Verified lesson wording"
          : `${content.provenance} personalized wording`}
      </p>
    </section>
  );
}
