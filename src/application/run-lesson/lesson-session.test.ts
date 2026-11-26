import { hangingPiecePlaybook } from "../../test/fixtures/hanging-piece";
import { describe, expect, it } from "vitest";

import {
  hangingPieceFacts,
  hangingPieceSelectionEvidence,
} from "../../test/fixtures/lesson-test-fixtures";
import {
  currentLessonContentRequest,
  startSelectedLesson,
} from "./lesson-session";

describe("lesson session", () => {
  it("selects, pins, and prepares exactly one eligible playbook step", () => {
    const result = startSelectedLesson({
      registry: [hangingPiecePlaybook],
      runId: "session-1",
      startedAt: "2026-11-24T12:00:00.000Z",
      evidence: [hangingPieceSelectionEvidence],
    });

    expect(result.status).toBe("started");
    if (result.status !== "started") return;
    expect(result.run.playbookVersion).toBe("1.0.0");
    expect(
      currentLessonContentRequest({
        playbook: result.playbook,
        facts: result.facts,
        run: result.run,
      }),
    ).toMatchObject({
      playbookId: "tactics.hanging-piece",
      playbookVersion: "1.0.0",
      facts: hangingPieceFacts,
    });
  });

  it("returns a stable not-eligible result when evidence is insufficient", () => {
    expect(
      startSelectedLesson({
        registry: [hangingPiecePlaybook],
        runId: "session-2",
        startedAt: "2026-11-24T12:00:00.000Z",
        evidence: [{ ...hangingPieceSelectionEvidence, confidence: 0.1 }],
      }),
    ).toEqual({ status: "not-eligible" });
  });
});
