import { z } from "zod";

export const workerRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("initialize"),
    requestId: z.string().min(1),
    protocolVersion: z.literal(1),
  }),
  z.object({
    type: z.literal("search"),
    requestId: z.string().min(1),
    protocolVersion: z.literal(1),
    positionId: z.string().min(1),
    fen: z.string().min(1),
    moves: z.array(z.string()),
    targetElo: z.number().int().min(400).max(3190),
    timeBudgetMs: z.number().int().positive().max(5000),
  }),
  z.object({
    type: z.literal("cancel"),
    requestId: z.string().min(1),
    protocolVersion: z.literal(1),
  }),
]);

export type WorkerRequest = z.infer<typeof workerRequestSchema>;

export const workerResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ready"),
    requestId: z.string().min(1),
    protocolVersion: z.literal(1),
  }),
  z.object({
    type: z.literal("best-move"),
    requestId: z.string().min(1),
    protocolVersion: z.literal(1),
    positionId: z.string().min(1),
    uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
  }),
  z.object({
    type: z.literal("error"),
    requestId: z.string().min(1),
    protocolVersion: z.literal(1),
    code: z.enum(["not-ready", "invalid-request", "timeout", "crashed"]),
    message: z.string(),
  }),
]);

export type WorkerResponse = z.infer<typeof workerResponseSchema>;
