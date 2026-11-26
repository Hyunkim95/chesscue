import { Chess } from "chess.js";
import { z } from "zod";
import { learningThemeSchema } from "../analysis/types";
import { validateGeneratedTransferExercise } from "../transfer/validate";
import { reflectionSchema } from "./reflection-schema";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const generationSchema = z.object({
  model: z.string().min(1),
  route: z.enum(["on-device", "cloud"]),
  runId: z.uuid(),
  promptVersion: z.string().min(1),
  promptHash: sha,
  responseHash: sha,
});
export const cueRecordSchema = z.object({
  id: z.string().min(1),
  fen: z.string(),
  question: reflectionSchema,
  authorship: generationSchema,
});
export type AuthoredCue = z.infer<typeof cueRecordSchema>;
export const sourceSchema = z.object({
  url: z.url().startsWith("https://"),
  sourceHash: sha,
  ply: z.number().int().positive(),
});
export const engineProofSchema = z.object({
  engine: z.literal("Stockfish 19 Lite WASM"),
  moveTimeMs: z.number().int().positive(),
  multiPv: z.number().int().min(1).max(5),
  verifiedAt: z.iso.date(),
  toleranceCp: z.number().int().min(0).max(35),
  bestMoveUci: z.string(),
  principalVariation: z.array(z.string()).min(1).max(20),
  candidates: z
    .array(z.object({ uci: z.string(), evaluationCp: z.number().int() }))
    .min(1),
});
export const historicalProofSchema = z.object({
  source: sourceSchema,
  authorship: generationSchema,
  verification: engineProofSchema,
});
export type HistoricalProof = z.infer<typeof historicalProofSchema>;
export const exerciseSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.string(),
    id: z.string(),
    theme: learningThemeSchema,
    difficulty: z.enum(["close", "unlabeled"]),
    fen: z.string(),
    acceptableMoves: z.array(z.string()),
    prompt: reflectionSchema,
    explanation: z.string(),
    provenance: z.string(),
    verification: engineProofSchema,
    source: sourceSchema,
    authorship: generationSchema,
  })
  .refine((e) => validateGeneratedTransferExercise(e).ok);
export function checkedLine(fen: string, moves: readonly string[]) {
  try {
    const board = new Chess(fen);
    return (
      moves.length > 0 &&
      moves.every((uci) => !board.isGameOver() && board.move(uci).lan === uci)
    );
  } catch {
    return false;
  }
}
