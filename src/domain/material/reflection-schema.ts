import { z } from "zod";
// Wording may invite reflection. The separate evidence renderer supplies moves,
// evaluations and concrete board claims.
export const reflectionSchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(
    /^(what|which|how|why|where|when|would|could|can|do|is|are)\b[^.!?<>\d\n]+\?$/i,
  )
  .refine(
    (text) =>
      !/(?:checkmate|forced|winning|losing|sacrifice|undefended|only move|guarantee|blunder)/i.test(
        text,
      ),
  );
