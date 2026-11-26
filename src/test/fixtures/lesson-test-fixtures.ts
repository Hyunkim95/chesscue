import { canonicalHangingPieceFacts } from "./canonical-hanging-piece";
import type { LessonSelectionEvidence } from "../../domain/lessons/types";

export const hangingPieceFacts = canonicalHangingPieceFacts;

export const hangingPieceSelectionEvidence: LessonSelectionEvidence = {
  theme: "hanging-piece",
  evidenceCount: 3,
  confidence: 0.82,
  priority: 0.9,
  factPacket: hangingPieceFacts,
};
