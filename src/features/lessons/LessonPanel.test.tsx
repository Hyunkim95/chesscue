import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deterministicLessonContent } from "../../domain/coaching/resolve-content";
import { hangingPiecePlaybook } from "../../test/fixtures/hanging-piece";
import { hangingPieceFacts } from "../../test/fixtures/lesson-test-fixtures";
import { startLessonRun } from "../../domain/lessons/run-lesson";
import { LessonPanel } from "./LessonPanel";

const step = hangingPiecePlaybook.steps[0];
if (step === undefined)
  throw new Error("Hanging-piece playbook must define its first step");

afterEach(cleanup);

describe("LessonPanel", () => {
  it("shows the fixed playbook step and submits a learner answer", () => {
    const onSubmit = vi.fn();
    const run = startLessonRun({
      id: "lesson-ui",
      playbook: hangingPiecePlaybook,
      facts: hangingPieceFacts,
      startedAt: "2026-11-24T12:00:00.000Z",
    });
    const content = deterministicLessonContent({
      playbookId: hangingPiecePlaybook.id,
      playbookVersion: hangingPiecePlaybook.version,
      step,
      facts: hangingPieceFacts,
    });

    render(
      <LessonPanel
        playbook={hangingPiecePlaybook}
        facts={hangingPieceFacts}
        run={run}
        content={content}
        feedback={null}
        onSubmit={onSubmit}
        onContinue={() => undefined}
        onRestart={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "b5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));

    expect(onSubmit).toHaveBeenCalledWith("b5");
    expect(screen.getByLabelText("Content source")).toHaveTextContent(
      "Verified playbook wording",
    );
    expect(
      screen.getByRole("grid", { name: "Lesson position, White side" }),
    ).toBeVisible();
    expect(
      screen.getByRole("gridcell", { name: "White bishop on b5" }),
    ).toBeVisible();
  });
});
