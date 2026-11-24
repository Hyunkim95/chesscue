import { describe, expect, it } from "vitest";

import { hangingPiecePlaybook } from "../../domain/lessons/hanging-piece";
import { hangingPieceFacts } from "../../domain/lessons/lesson-test-fixtures";
import {
  startLessonRun,
  submitLessonAnswer,
} from "../../domain/lessons/run-lesson";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
import { prepareLessonStep } from "./prepare-step";

const step = hangingPiecePlaybook.steps[0];
if (step === undefined)
  throw new Error("Hanging-piece playbook must define its first step");

const request = {
  playbookId: hangingPiecePlaybook.id,
  playbookVersion: hangingPiecePlaybook.version,
  step,
  facts: hangingPieceFacts,
};

describe("prepareLessonStep", () => {
  it("keeps scoring and transitions identical across generated and fallback wording", async () => {
    const provider: LessonContentProvider = {
      generate: () =>
        Promise.resolve({
          provenance: "on-device",
          value: {
            stepId: step.id,
            prompt: "Find the vulnerable piece on b5.",
            correctFeedback: "Correct.",
            incorrectFeedback: "Try another attacked piece.",
            referencedMoves: [],
            referencedSquares: ["b5"],
            referencedNumbers: [],
          },
        }),
    };
    const signal = new AbortController().signal;
    const generated = await prepareLessonStep({ request, provider, signal });
    const fallback = await prepareLessonStep({
      request,
      provider: null,
      signal,
    });
    const start = startLessonRun({
      id: "run-equivalence",
      playbook: hangingPiecePlaybook,
      facts: hangingPieceFacts,
      startedAt: "2026-11-24T12:00:00.000Z",
    });
    const submission = {
      answer: "b5",
      submittedAt: "2026-11-24T12:01:00.000Z",
    };
    const generatedResult = submitLessonAnswer({
      run: start,
      playbook: hangingPiecePlaybook,
      facts: hangingPieceFacts,
      submission,
    });
    const fallbackResult = submitLessonAnswer({
      run: start,
      playbook: hangingPiecePlaybook,
      facts: hangingPieceFacts,
      submission,
    });

    expect(generated.provenance).toBe("on-device");
    expect(fallback.provenance).toBe("deterministic");
    expect(generatedResult).toEqual(fallbackResult);
  });
});
