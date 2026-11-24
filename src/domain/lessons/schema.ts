import { z } from "zod";

import { curriculumThemes } from "../curriculum/types";
import { lessonStepKinds } from "./types";

const answerKeys = [
  "endangered-square",
  "threatened-move",
  "acceptable-moves",
  "reason-codes",
  "transfer-moves",
] as const;

export const lessonPlaybookSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z]+(?:[.-][a-z]+)+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  theme: z.enum(curriculumThemes),
  objective: z.string().min(10).max(240),
  prerequisites: z.array(z.string().min(1).max(100)),
  trigger: z.object({
    minimumEvidenceCount: z.number().int().min(1).max(20),
    minimumConfidence: z.number().min(0).max(1),
  }),
  steps: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z]+(?:-[a-z]+)*$/),
        kind: z.enum(lessonStepKinds),
        promptSlot: z.string().min(1).max(80),
        fallbackPrompt: z.string().min(1).max(400),
        fallbackCorrectFeedback: z.string().min(1).max(300),
        fallbackIncorrectFeedback: z.string().min(1).max(300),
        answerKey: z.enum(answerKeys),
      }),
    )
    .min(1)
    .max(6),
  reinforcement: z.object({
    focus: z.enum(curriculumThemes),
    preferredOpeningFamilies: z.array(z.string().min(1).max(80)).max(8),
    description: z.string().min(1).max(300),
  }),
});
