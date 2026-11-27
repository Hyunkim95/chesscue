import { z } from "zod";

import type { MomentAttemptRecord } from "../../domain/progress/types";

const tier = z.enum(["best", "missed", "worse", "costly"]);

export const momentAttemptRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    source: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("game"),
          gameId: z.string().min(1),
          ply: z.number().int().nonnegative(),
        })
        .strict(),
      z
        .object({ kind: z.literal("puzzle"), puzzleId: z.string().min(1) })
        .strict(),
    ]),
    unitId: z.string().min(1).optional(),
    firstMoveUci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
    tiers: z.array(tier),
    outcome: z.enum(["spotted", "found-on-retry", "shown"]),
    helped: z.boolean(),
    explorations: z.number().int().nonnegative(),
    completedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export function parseMomentAttemptRecord(
  value: unknown,
): MomentAttemptRecord | undefined {
  const parsed = momentAttemptRecordSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { unitId, ...rest } = parsed.data;
  return unitId === undefined ? rest : { ...rest, unitId };
}
