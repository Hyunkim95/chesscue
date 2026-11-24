import { describe, expect, it } from "vitest";

import { hangingPiecePlaybook } from "../lessons/hanging-piece";
import { hangingPieceFacts } from "../lessons/lesson-test-fixtures";
import {
  deterministicLessonContent,
  resolveLessonContent,
} from "./resolve-content";
import type { LessonContentRequest } from "./types";

const step = hangingPiecePlaybook.steps[0];
if (step === undefined)
  throw new Error("Hanging-piece playbook must define its first step");

const request: LessonContentRequest = {
  playbookId: hangingPiecePlaybook.id,
  playbookVersion: hangingPiecePlaybook.version,
  step,
  facts: hangingPieceFacts,
};

const validGenerated = {
  stepId: step.id,
  prompt: "Which piece on b5 needs your attention?",
  correctFeedback: "Correct. The piece on b5 is vulnerable.",
  incorrectFeedback: "Scan the attacked pieces again.",
  referencedMoves: [],
  referencedSquares: ["b5"],
  referencedNumbers: [],
};

describe("resolveLessonContent", () => {
  it("accepts generated wording that stays inside the fact packet", () => {
    const resolved = resolveLessonContent({
      request,
      generated: validGenerated,
      generatedProvenance: "on-device",
    });

    expect(resolved.provenance).toBe("on-device");
    expect(resolved.validationFailure).toBeNull();
  });

  it("rejects an unsupported chess fact and uses deterministic wording", () => {
    const resolved = resolveLessonContent({
      request,
      generated: {
        ...validGenerated,
        prompt: "Play a2a4 now.",
        referencedMoves: ["a2a4"],
      },
      generatedProvenance: "cloud",
    });

    expect(resolved.provenance).toBe("deterministic");
    expect(resolved.validationFailure).toBe("unsupported-move-reference");
    expect(resolved.content).toEqual(
      deterministicLessonContent(request).content,
    );
  });

  it("rejects schema drift rather than accepting new agent-controlled fields", () => {
    const resolved = resolveLessonContent({
      request,
      generated: { ...validGenerated, nextStep: "skip-to-complete" },
      generatedProvenance: "cloud",
    });

    expect(resolved.provenance).toBe("deterministic");
    expect(resolved.validationFailure).toBe("schema-invalid");
  });
});
