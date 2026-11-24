import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hangingPiecePlaybook } from "../../domain/lessons/hanging-piece";
import { hangingPieceFacts } from "../../domain/lessons/lesson-test-fixtures";
import type { LessonRun } from "../../domain/lessons/types";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
import { LessonExperience } from "./LessonExperience";

afterEach(cleanup);

const renderExperience = (
  onComplete: ((run: LessonRun) => void) | null = null,
) =>
  render(
    <LessonExperience
      runId="interactive-lesson"
      startedAt="2026-11-24T12:00:00.000Z"
      playbook={hangingPiecePlaybook}
      facts={hangingPieceFacts}
      now={() => "2026-11-24T12:01:00.000Z"}
      onComplete={onComplete}
    />,
  );

const answerCurrentStep = (answer: string): void => {
  fireEvent.change(screen.getByLabelText("Your answer"), {
    target: { value: answer },
  });
  fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
};

describe("LessonExperience", () => {
  it("shows generated wording provenance only after playbook validation", async () => {
    const firstStep = hangingPiecePlaybook.steps[0];
    if (firstStep === undefined)
      throw new Error("Expected the hanging-piece first step");
    const provider: LessonContentProvider = {
      generate: () =>
        Promise.resolve({
          provenance: "on-device",
          value: {
            stepId: firstStep.id,
            prompt: "Which bishop on b5 needs your attention?",
            correctFeedback: "Correct. The bishop on b5 is vulnerable.",
            incorrectFeedback: "Scan the attacked pieces again.",
            referencedMoves: [],
            referencedSquares: ["b5"],
            referencedNumbers: [],
          },
        }),
    };

    render(
      <LessonExperience
        runId="generated-lesson"
        startedAt="2026-11-24T12:00:00.000Z"
        playbook={hangingPiecePlaybook}
        facts={hangingPieceFacts}
        provider={provider}
      />,
    );

    expect(await screen.findByLabelText("Content source")).toHaveTextContent(
      "on-device wording, verified against playbook facts",
    );
  });

  it("moves from the verified position to deterministic feedback and the next step", () => {
    renderExperience();

    expect(screen.getByText("Step 1: recognize")).toBeVisible();
    answerCurrentStep("b5");

    expect(
      screen.getByRole("heading", { name: "That is the key detail" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Continue lesson" }));
    expect(screen.getByText("Step 2: predict")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "What move is your opponent threatening next?",
      }),
    ).toBeVisible();
  });

  it("enters remediation after two incorrect answers and can restart", () => {
    renderExperience();

    answerCurrentStep("a1");
    fireEvent.click(
      screen.getByRole("button", { name: "Try this step again" }),
    );
    answerCurrentStep("a1");

    expect(
      screen.getByRole("heading", { name: "Reset the threat scan" }),
    ).toBeVisible();
    expect(screen.getByText("Still in your plan")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Restart this lesson" }),
    );
    expect(screen.getByText("Step 1: recognize")).toBeVisible();
  });

  it("completes all playbook steps and shows next-game reinforcement", () => {
    const onComplete = vi.fn<(run: LessonRun) => void>();
    renderExperience(onComplete);
    const answers = ["b5", "a6b5", "b5c6", "move-to-safety", "b5a4"];

    for (const [index, answer] of answers.entries()) {
      answerCurrentStep(answer);
      if (index < answers.length - 1) {
        fireEvent.click(
          screen.getByRole("button", { name: "Continue lesson" }),
        );
      }
    }

    expect(
      screen.getByRole("heading", { name: "You spotted the loose piece" }),
    ).toBeVisible();
    expect(screen.getByText("Your next game")).toBeVisible();
    expect(
      screen.getByText(hangingPiecePlaybook.reinforcement.description),
    ).toBeVisible();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({
      status: "completed",
    });
  });
});
