import { lessonPlaybookSchema } from "../../domain/lessons/schema";
import type { LessonPlaybook } from "../../domain/lessons/types";

const candidate = {
  schemaVersion: 1,
  id: "tactics.hanging-piece",
  version: "1.0.0",
  theme: "hanging-piece",
  objective:
    "Recognize an attacked undefended piece and choose a legal response before material is lost.",
  prerequisites: ["legal-move-basics", "piece-values"],
  trigger: {
    minimumEvidenceCount: 2,
    minimumConfidence: 0.55,
  },
  steps: [
    {
      id: "recognize-danger",
      kind: "recognize",
      promptSlot: "recognizePrompt",
      fallbackPrompt:
        "Which of your pieces is attacked and not adequately defended?",
      fallbackCorrectFeedback:
        "Correct. You found the loose piece before calculating a response.",
      fallbackIncorrectFeedback:
        "Check each attacked piece and compare its defenders with its attackers.",
      answerKey: "endangered-square",
    },
    {
      id: "predict-threat",
      kind: "predict",
      promptSlot: "predictPrompt",
      fallbackPrompt: "What move is your opponent threatening next?",
      fallbackCorrectFeedback:
        "Correct. Naming the threat makes the decision concrete.",
      fallbackIncorrectFeedback:
        "Look for the most forcing legal capture of the loose piece.",
      answerKey: "threatened-move",
    },
    {
      id: "choose-response",
      kind: "choose",
      promptSlot: "choosePrompt",
      fallbackPrompt:
        "Choose a legal move that answers the threat without losing material.",
      fallbackCorrectFeedback:
        "Correct. This move resolves the immediate material threat.",
      fallbackIncorrectFeedback:
        "The move must directly address the threatened capture.",
      answerKey: "acceptable-moves",
    },
    {
      id: "explain-response",
      kind: "explain",
      promptSlot: "explainPrompt",
      fallbackPrompt: "Why does that response work?",
      fallbackCorrectFeedback:
        "Correct. The explanation matches the verified tactical reason.",
      fallbackIncorrectFeedback:
        "Connect the move to defense, escape, exchange, or a stronger counter-threat.",
      answerKey: "reason-codes",
    },
    {
      id: "apply-transfer",
      kind: "apply",
      promptSlot: "applyPrompt",
      fallbackPrompt:
        "In this related position, choose a move that prevents a loose piece from being lost.",
      fallbackCorrectFeedback:
        "Correct. You transferred the idea to a new position.",
      fallbackIncorrectFeedback:
        "Repeat the scan: attacks, defenders, forcing captures, then candidate responses.",
      answerKey: "transfer-moves",
    },
  ],
  reinforcement: {
    focus: "hanging-piece",
    preferredOpeningFamilies: ["Italian Game", "Queen's Gambit Declined"],
    description:
      "Favor positions with ordinary piece-pressure decisions without forcing artificial blunders.",
  },
} as const;

const parsed = lessonPlaybookSchema.parse(candidate);

export const hangingPiecePlaybook: LessonPlaybook = Object.freeze({
  ...parsed,
  prerequisites: Object.freeze([...parsed.prerequisites]),
  steps: Object.freeze(parsed.steps.map((step) => Object.freeze({ ...step }))),
  reinforcement: Object.freeze({
    ...parsed.reinforcement,
    preferredOpeningFamilies: Object.freeze([
      ...parsed.reinforcement.preferredOpeningFamilies,
    ]),
  }),
});
