import { describe, expect, it } from "vitest";

import { hangingPiecePlaybook } from "./hanging-piece";
import {
  hangingPieceFacts,
  hangingPieceSelectionEvidence,
} from "./lesson-test-fixtures";
import { lessonPlaybookRegistry } from "./registry";
import { startLessonRun, submitLessonAnswer } from "./run-lesson";
import { selectLessonPlaybook } from "./select-playbook";
import { validateLessonFacts } from "./validate-facts";

const START = "2026-11-24T12:00:00.000Z";

describe("lesson playbook selection", () => {
  it("selects the immutable hanging-piece playbook from sufficient evidence", () => {
    const selection = selectLessonPlaybook(lessonPlaybookRegistry, [
      hangingPieceSelectionEvidence,
    ]);

    expect(selection?.playbook.id).toBe("tactics.hanging-piece");
    expect(selection?.playbook.version).toBe("1.0.0");
    expect(selection?.factPacket.packetId).toBe(hangingPieceFacts.packetId);
    expect(Object.isFrozen(selection?.playbook)).toBe(true);
    expect(Object.isFrozen(selection?.playbook.steps)).toBe(true);
  });

  it("does not select a playbook below its evidence threshold", () => {
    const selection = selectLessonPlaybook(lessonPlaybookRegistry, [
      { ...hangingPieceSelectionEvidence, evidenceCount: 1 },
    ]);

    expect(selection).toBeNull();
  });
});

describe("lesson playbook runner", () => {
  it("validates the endangered piece, threat capture, and legal responses", () => {
    expect(
      validateLessonFacts(hangingPiecePlaybook, hangingPieceFacts),
    ).toEqual({ valid: true });
    expect(
      validateLessonFacts(hangingPiecePlaybook, {
        ...hangingPieceFacts,
        threatenedMove: "a6a5",
      }),
    ).toEqual({
      valid: false,
      reason: "threat-does-not-capture-endangered-piece",
    });
    expect(
      validateLessonFacts(hangingPiecePlaybook, {
        ...hangingPieceFacts,
        acceptableMoves: ["e4e5"],
      }),
    ).toEqual({ valid: false, reason: "illegal-acceptable-move" });
  });

  it("completes the fixed sequence and emits deterministic mastery and reinforcement", () => {
    let run = startLessonRun({
      id: "lesson-1",
      playbook: hangingPiecePlaybook,
      facts: hangingPieceFacts,
      startedAt: START,
    });
    const answers = ["b5", "a6b5", "b5c6", "move-to-safety", "b5a4"];

    for (const [index, answer] of answers.entries()) {
      run = submitLessonAnswer({
        run,
        playbook: hangingPiecePlaybook,
        facts: hangingPieceFacts,
        submission: {
          answer,
          submittedAt: `2026-11-24T12:0${String(index + 1)}:00.000Z`,
        },
      }).run;
    }

    expect(run.status).toBe("completed");
    expect(run.masteryEvidence).toEqual({
      theme: "hanging-piece",
      outcome: "success",
      score: 1,
      confidence: 0.95,
      sourceLessonRunId: "lesson-1",
    });
    expect(run.reinforcement).toEqual(hangingPiecePlaybook.reinforcement);
    expect(run.playbookVersion).toBe("1.0.0");
  });

  it("keeps the step after one error and deterministically remediates after two", () => {
    const started = startLessonRun({
      id: "lesson-2",
      playbook: hangingPiecePlaybook,
      facts: hangingPieceFacts,
      startedAt: START,
    });
    const first = submitLessonAnswer({
      run: started,
      playbook: hangingPiecePlaybook,
      facts: hangingPieceFacts,
      submission: { answer: "a1", submittedAt: "2026-11-24T12:01:00.000Z" },
    });
    const second = submitLessonAnswer({
      run: first.run,
      playbook: hangingPiecePlaybook,
      facts: hangingPieceFacts,
      submission: { answer: "b2", submittedAt: "2026-11-24T12:02:00.000Z" },
    });

    expect(first.feedbackKind).toBe("incorrect");
    expect(first.run.currentStepIndex).toBe(0);
    expect(second.feedbackKind).toBe("remediate");
    expect(second.run.status).toBe("remediate");
    expect(second.run.masteryEvidence?.outcome).toBe("weakness");
  });

  it("stops rather than running a different playbook version", () => {
    const started = startLessonRun({
      id: "lesson-3",
      playbook: hangingPiecePlaybook,
      facts: hangingPieceFacts,
      startedAt: START,
    });
    const changedPlaybook = { ...hangingPiecePlaybook, version: "2.0.0" };

    const result = submitLessonAnswer({
      run: started,
      playbook: changedPlaybook,
      facts: hangingPieceFacts,
      submission: { answer: "b5", submittedAt: "2026-11-24T12:01:00.000Z" },
    });

    expect(result.run.status).toBe("stopped");
    expect(result.run.stopReason).toBe("playbook-version-mismatch");
  });
});
