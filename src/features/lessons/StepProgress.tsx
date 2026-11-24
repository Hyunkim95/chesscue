import type { LessonPlaybook, LessonRun } from "../../domain/lessons/types";

export interface StepProgressProps {
  readonly playbook: LessonPlaybook;
  readonly run: LessonRun;
}

export function StepProgress({ playbook, run }: StepProgressProps) {
  const completedCount =
    run.status === "completed" ? playbook.steps.length : run.currentStepIndex;
  const percentage = Math.round((completedCount / playbook.steps.length) * 100);

  return (
    <div
      className="lesson-progress"
      aria-label={`Lesson progress: ${String(percentage)} percent`}
    >
      <div className="lesson-progress__track" aria-hidden="true">
        <span style={{ width: `${String(percentage)}%` }} />
      </div>
      <ol>
        {playbook.steps.map((step, index) => {
          const completed = index < completedCount;
          const current =
            run.status === "active" && index === run.currentStepIndex;
          return (
            <li
              key={step.id}
              className={
                completed ? "is-complete" : current ? "is-current" : ""
              }
              aria-current={current ? "step" : undefined}
            >
              <span aria-hidden="true">{completed ? "✓" : index + 1}</span>
              <span>{step.kind}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
