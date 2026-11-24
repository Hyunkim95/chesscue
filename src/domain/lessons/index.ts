export { canonicalHangingPieceFacts } from "./canonical-hanging-piece";
export { hangingPiecePlaybook } from "./hanging-piece";
export { getLessonPlaybook, lessonPlaybookRegistry } from "./registry";
export { startLessonRun, submitLessonAnswer } from "./run-lesson";
export { selectLessonPlaybook } from "./select-playbook";
export { validateLessonFacts } from "./validate-facts";
export type {
  LessonFactPacket,
  LessonPlaybook,
  LessonRun,
  LessonSelectionEvidence,
  LessonStepResult,
  LessonSubmission,
} from "./types";
