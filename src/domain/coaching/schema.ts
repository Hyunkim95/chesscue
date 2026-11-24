import { z } from "zod";

export const generatedLessonContentSchema = z
  .object({
    stepId: z.string().min(1).max(80),
    prompt: z.string().min(1).max(400),
    correctFeedback: z.string().min(1).max(300),
    incorrectFeedback: z.string().min(1).max(300),
    referencedMoves: z
      .array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/))
      .max(8),
    referencedSquares: z.array(z.string().regex(/^[a-h][1-8]$/)).max(8),
    referencedNumbers: z.array(z.number()).max(8),
  })
  .strict();
