import type {
  LessonAnswerKey,
  LessonFactPacket,
  LessonPlaybook,
  LessonRun,
  LessonStepResult,
  LessonSubmission,
} from "./types";
import { validateLessonFacts } from "./validate-facts";

const normalizeAnswer = (answer: string): string => answer.trim().toLowerCase();

const acceptedAnswers = (
  key: LessonAnswerKey,
  facts: LessonFactPacket,
): readonly string[] => {
  switch (key) {
    case "endangered-square":
      return [facts.endangeredSquare];
    case "threatened-move":
      return [facts.threatenedMove];
    case "acceptable-moves":
      return facts.acceptableMoves;
    case "reason-codes":
      return facts.reasonCodes;
    case "transfer-moves":
      return facts.transferMoves;
  }
};

export const startLessonRun = (input: {
  readonly id: string;
  readonly playbook: LessonPlaybook;
  readonly facts: LessonFactPacket;
  readonly startedAt: string;
}): LessonRun => {
  const factValidation = validateLessonFacts(input.playbook, input.facts);
  if (!factValidation.valid) {
    return {
      schemaVersion: 1,
      id: input.id,
      playbookId: input.playbook.id,
      playbookVersion: input.playbook.version,
      factPacketId: input.facts.packetId,
      sourceGameIds: input.facts.sourceGameIds,
      currentStepIndex: 0,
      status: "stopped",
      attempts: [],
      incorrectAnswerCount: 0,
      startedAt: input.startedAt,
      completedAt: input.startedAt,
      masteryEvidence: null,
      reinforcement: input.playbook.reinforcement,
      stopReason: factValidation.reason,
    };
  }

  return {
    schemaVersion: 1,
    id: input.id,
    playbookId: input.playbook.id,
    playbookVersion: input.playbook.version,
    factPacketId: input.facts.packetId,
    sourceGameIds: input.facts.sourceGameIds,
    currentStepIndex: 0,
    status: "active",
    attempts: [],
    incorrectAnswerCount: 0,
    startedAt: input.startedAt,
    completedAt: null,
    masteryEvidence: null,
    reinforcement: input.playbook.reinforcement,
    stopReason: null,
  };
};

export const submitLessonAnswer = (input: {
  readonly run: LessonRun;
  readonly playbook: LessonPlaybook;
  readonly facts: LessonFactPacket;
  readonly submission: LessonSubmission;
}): LessonStepResult => {
  const { run, playbook, facts, submission } = input;
  if (run.status !== "active") {
    return {
      run,
      correct: false,
      feedbackKind: run.status === "completed" ? "completed" : "remediate",
    };
  }
  if (
    run.playbookId !== playbook.id ||
    run.playbookVersion !== playbook.version
  ) {
    const stopped: LessonRun = {
      ...run,
      status: "stopped",
      completedAt: submission.submittedAt,
      stopReason: "playbook-version-mismatch",
    };
    return { run: stopped, correct: false, feedbackKind: "remediate" };
  }
  if (run.factPacketId !== facts.packetId || playbook.theme !== facts.theme) {
    const stopped: LessonRun = {
      ...run,
      status: "stopped",
      completedAt: submission.submittedAt,
      stopReason: "fact-packet-mismatch",
    };
    return { run: stopped, correct: false, feedbackKind: "remediate" };
  }

  const step = playbook.steps[run.currentStepIndex];
  if (step === undefined) {
    const stopped: LessonRun = {
      ...run,
      status: "stopped",
      completedAt: submission.submittedAt,
      stopReason: "step-not-found",
    };
    return { run: stopped, correct: false, feedbackKind: "remediate" };
  }

  const answer = normalizeAnswer(submission.answer);
  const correct = acceptedAnswers(step.answerKey, facts).some(
    (accepted) => normalizeAnswer(accepted) === answer,
  );
  const attempts = [
    ...run.attempts,
    {
      stepId: step.id,
      answer: submission.answer,
      correct,
      attemptedAt: submission.submittedAt,
    },
  ];

  if (!correct) {
    const incorrectAnswerCount = run.incorrectAnswerCount + 1;
    if (incorrectAnswerCount >= 2) {
      const masteryEvidence = {
        theme: playbook.theme,
        outcome: "weakness" as const,
        score:
          attempts.filter((attempt) => attempt.correct).length /
          playbook.steps.length,
        confidence: 0.75,
        sourceLessonRunId: run.id,
      };
      return {
        run: {
          ...run,
          status: "remediate",
          attempts,
          incorrectAnswerCount,
          completedAt: submission.submittedAt,
          masteryEvidence,
          stopReason: "two-incorrect-core-answers",
        },
        correct,
        feedbackKind: "remediate",
      };
    }
    return {
      run: { ...run, attempts, incorrectAnswerCount },
      correct,
      feedbackKind: "incorrect",
    };
  }

  const nextStepIndex = run.currentStepIndex + 1;
  if (nextStepIndex >= playbook.steps.length) {
    const masteryEvidence = {
      theme: playbook.theme,
      outcome: "success" as const,
      score:
        attempts.filter((attempt) => attempt.correct).length /
        playbook.steps.length,
      confidence: run.incorrectAnswerCount === 0 ? 0.95 : 0.8,
      sourceLessonRunId: run.id,
    };
    return {
      run: {
        ...run,
        status: "completed",
        currentStepIndex: nextStepIndex,
        attempts,
        completedAt: submission.submittedAt,
        masteryEvidence,
      },
      correct,
      feedbackKind: "completed",
    };
  }

  return {
    run: { ...run, currentStepIndex: nextStepIndex, attempts },
    correct,
    feedbackKind: "correct",
  };
};
