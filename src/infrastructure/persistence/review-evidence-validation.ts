import { z } from "zod";

import type { ReviewEvidenceRecord } from "../../application/ports/review-evidence-repository";
import { learningThemeSchema } from "../../domain/analysis/types";

const dueReviewSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reviewEvidenceRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1).max(160),
    gameId: z.string().min(1),
    analysisVersion: z.string().min(1).max(80),
    theme: learningThemeSchema,
    firstAttemptScore: z.number().int().min(0).max(100),
    originalAttemptScore: z.number().int().min(0).max(100).optional(),
    closeTransferScore: z.number().int().min(0).max(100).nullable().optional(),
    unlabeledTransferScore: z
      .number()
      .int()
      .min(0)
      .max(100)
      .nullable()
      .optional(),
    hardSpot: z.string().min(1).max(400),
    dueReview: dueReviewSchema,
    reinforcement: z.string().min(1).max(800),
    transfer: z.enum(["completed", "scheduled-next-game"]),
    completedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const isReviewEvidenceRecord = (
  value: unknown,
): value is ReviewEvidenceRecord =>
  reviewEvidenceRecordSchema.safeParse(value).success;

export const isDueReviewDate = (value: string): boolean =>
  dueReviewSchema.safeParse(value).success;

export const serializeReviewEvidenceRecord = (
  record: ReviewEvidenceRecord,
): string => JSON.stringify(reviewEvidenceRecordSchema.parse(record));
