import {
  historicalProofSchema,
  checkedLine,
} from "../../domain/material/verified";
import { Chess, validateFen } from "chess.js";
import { z } from "zod";
export const fenSchema = z
  .string()
  .max(150)
  .refine((fen) => validateFen(fen).ok);
const line = z.array(z.string().max(12)).max(512);
const color = z.enum(["white", "black"]);
function validLine(position: { fen: string; continuation: readonly string[] }) {
  try {
    const board = new Chess(position.fen);
    for (const move of position.continuation) board.move(move);
    return true;
  } catch {
    return false;
  }
}
const position = z
  .object({ fen: fenSchema, orientation: color, continuation: line })
  .refine(validLine);
export const historicalSchema = z
  .object({
    proof: historicalProofSchema,
    lesson: z
      .object({
        title: z.string(),
        fen: fenSchema,
        insight: z.string(),
        question: z.string(),
        continuation: line,
      })
      .refine(validLine),
    orientation: color,
    scoreUrl: z.url({ protocol: /^https$/ }),
    goal: z.string(),
    origin: z
      .object({
        position,
        theme: z.string(),
        gameLabel: z.string(),
        day: z.string(),
        played: z.string(),
        preferred: z.string(),
        candidateAction: z.string(),
        reply: z.string().nullable(),
      })
      .nullable(),
  })
  .refine(
    (item) =>
      item.proof.source.url === item.scoreUrl &&
      item.proof.verification.bestMoveUci ===
        item.proof.verification.principalVariation[0] &&
      checkedLine(item.lesson.fen, item.proof.verification.principalVariation),
  );
