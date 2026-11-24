import { useId, useState, type SyntheticEvent } from "react";

import type { ResolvedLessonContent } from "../../domain/coaching/types";
import type {
  LessonFactPacket,
  LessonPlaybook,
  LessonRun,
} from "../../domain/lessons/types";
import { PositionBoard } from "./PositionBoard";
import { StepProgress } from "./StepProgress";
import "./lesson-experience.css";

export interface LessonFeedback {
  readonly kind: "correct" | "incorrect";
  readonly message: string;
}

export interface LessonPanelProps {
  readonly playbook: LessonPlaybook;
  readonly facts: LessonFactPacket;
  readonly run: LessonRun;
  readonly content: ResolvedLessonContent;
  readonly feedback: LessonFeedback | null;
  readonly onSubmit: (answer: string) => void;
  readonly onContinue: () => void;
  readonly onRestart: () => void;
}

const titleCase = (value: string): string =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function LessonPanel({
  playbook,
  facts,
  run,
  content,
  feedback,
  onSubmit,
  onContinue,
  onRestart,
}: LessonPanelProps) {
  const answerId = useId();
  const [answer, setAnswer] = useState("");
  const step = playbook.steps[run.currentStepIndex];

  if (run.status === "completed") {
    return (
      <section
        className="lesson-experience"
        aria-labelledby="lesson-complete-title"
      >
        <StepProgress playbook={playbook} run={run} />
        <div className="lesson-outcome" aria-live="polite">
          <span className="lesson-outcome__icon" aria-hidden="true">
            ✓
          </span>
          <p className="lesson-experience__eyebrow">Playbook complete</p>
          <h2 id="lesson-complete-title">You spotted the loose piece</h2>
          <p>
            {feedback?.message ??
              "You completed every verified step and transferred the idea to a related position."}
          </p>
          <div className="lesson-reinforcement">
            <strong>Your next game</strong>
            <span>{run.reinforcement.description}</span>
          </div>
          <p className="lesson-provenance">
            Scored by playbook {run.playbookId}@{run.playbookVersion}
          </p>
        </div>
      </section>
    );
  }

  if (
    run.status === "remediate" ||
    run.status === "stopped" ||
    step === undefined
  ) {
    return (
      <section
        className="lesson-experience"
        aria-labelledby="lesson-remediate-title"
      >
        <StepProgress playbook={playbook} run={run} />
        <div className="lesson-outcome" aria-live="polite">
          <span className="lesson-outcome__icon" aria-hidden="true">
            ↻
          </span>
          <p className="lesson-experience__eyebrow">Review before advancing</p>
          <h2 id="lesson-remediate-title">Reset the threat scan</h2>
          <p>
            Start with attacks, then defenders, then forcing captures. The same
            playbook will retry with verified wording.
          </p>
          <div className="lesson-reinforcement">
            <strong>Still in your plan</strong>
            <span>{run.reinforcement.description}</span>
          </div>
          <button
            className="lesson-secondary"
            type="button"
            onClick={onRestart}
          >
            Restart this lesson
          </button>
        </div>
      </section>
    );
  }

  if (feedback !== null) {
    return (
      <section
        className="lesson-experience"
        aria-labelledby="lesson-feedback-title"
      >
        <StepProgress playbook={playbook} run={run} />
        <div className="lesson-feedback" aria-live="polite">
          <span className="lesson-feedback__icon" aria-hidden="true">
            {feedback.kind === "correct" ? "✓" : "↻"}
          </span>
          <p className="lesson-experience__eyebrow">
            {feedback.kind === "correct"
              ? "Pattern found"
              : "Try the scan again"}
          </p>
          <h2 id="lesson-feedback-title">
            {feedback.kind === "correct"
              ? "That is the key detail"
              : "One more look"}
          </h2>
          <p>{feedback.message}</p>
          <button className="lesson-primary" type="button" onClick={onContinue}>
            {feedback.kind === "correct"
              ? "Continue lesson"
              : "Try this step again"}
          </button>
        </div>
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
    <section className="lesson-experience" aria-labelledby="lesson-title">
      <header className="lesson-experience__header">
        <div>
          <p className="lesson-experience__eyebrow">Playbook lesson</p>
          <h1 id="lesson-title">{titleCase(playbook.theme)}</h1>
        </div>
        <span className="lesson-version">
          {playbook.id}@{playbook.version}
        </span>
      </header>
      <StepProgress playbook={playbook} run={run} />
      <div className="lesson-stage">
        <PositionBoard
          fen={facts.fen}
          highlightedSquare={
            step.kind === "recognize" ? null : facts.endangeredSquare
          }
        />
        <div className="lesson-question">
          <p className="lesson-question__step">
            Step {run.currentStepIndex + 1}: {step.kind}
          </p>
          <h2>{content.content.prompt}</h2>
          <p className="lesson-question__prompt">{playbook.objective}</p>
          <form className="lesson-answer" onSubmit={submit}>
            <label htmlFor={answerId}>Your answer</label>
            <input
              id={answerId}
              value={answer}
              onChange={(event) => {
                setAnswer(event.currentTarget.value);
              }}
              autoComplete="off"
              placeholder={
                step.kind === "recognize"
                  ? "For example: b5"
                  : "Enter your answer"
              }
            />
            <button className="lesson-primary" type="submit">
              Check answer
            </button>
          </form>
          <p className="lesson-provenance" aria-label="Content source">
            {content.provenance === "deterministic"
              ? "Verified playbook wording"
              : `${content.provenance} wording, verified against playbook facts`}
          </p>
        </div>
      </div>
    </section>
  );
}
