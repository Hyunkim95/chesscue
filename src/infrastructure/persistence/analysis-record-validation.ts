import { z } from "zod";

import type { AnalysisRecord } from "../../application/ports/analysis-repository";
import {
  learningThemeSchema,
  moveAnalysisFactSchema,
} from "../../domain/analysis/types";

const uciMoveSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

const learningMomentSchema = z
  .object({
    id: z.string().min(1),
    gameId: z.string().min(1),
    ply: z.number().int().positive(),
    fenBefore: z.string().min(1),
    playedMoveUci: uciMoveSchema,
    playedMoveSan: z.string().min(1).max(24),
    candidateMoveUci: uciMoveSchema,
    candidateMoveSan: z.string().min(1).max(24).optional(),
    impactCp: z.number().int().min(0).max(100_000),
    theme: learningThemeSchema,
    phase: z.enum(["opening", "middlegame", "endgame"]),
    analysisVersion: z.string().min(1).max(80),
    trace: z
      .object({
        evaluationBeforeCp: z.number().int().min(-100_000).max(100_000),
        evaluationAfterCp: z.number().int().min(-100_000).max(100_000),
        recurrence: z.number().int().min(0).max(100),
        curricularRelevance: z.number().int().min(0).max(100),
      })
      .strict(),
  })
  .strict();

export const analysisRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    gameId: z.string().min(1),
    analysisVersion: z.string().min(1).max(80),
    engineBuild: z.string().min(1).max(120),
    searchSettings: z
      .object({
        timeBudgetPerPositionMs: z.number().int().min(1).max(60_000),
        multiPv: z.number().int().min(1).max(10),
      })
      .strict(),
    facts: z.array(moveAnalysisFactSchema),
    moments: z.array(learningMomentSchema).max(3),
    analyzedPlayerMoves: z.number().int().min(0),
    validationStatus: z.literal("validated"),
    analyzedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.analyzedPlayerMoves !== record.facts.length) {
      context.addIssue({
        code: "custom",
        path: ["analyzedPlayerMoves"],
        message:
          "Analyzed player move count must equal the number of validated facts.",
      });
    }
    for (const fact of record.facts) {
      if (
        fact.gameId !== record.gameId ||
        fact.analysisVersion !== record.analysisVersion
      ) {
        context.addIssue({
          code: "custom",
          path: ["facts"],
          message:
            "Every analysis fact must match the record game and analysis version.",
        });
        break;
      }
    }
    for (const moment of record.moments) {
      const matchingFact = record.facts.find(
        (fact) => fact.gameId === moment.gameId && fact.ply === moment.ply,
      );
      if (
        moment.gameId !== record.gameId ||
        moment.analysisVersion !== record.analysisVersion ||
        matchingFact === undefined
      ) {
        context.addIssue({
          code: "custom",
          path: ["moments"],
          message:
            "Every learning moment must trace to a fact in the same analysis version.",
        });
        break;
      }
    }
  });

export const isAnalysisRecord = (value: unknown): value is AnalysisRecord =>
  analysisRecordSchema.safeParse(value).success;

export const serializeAnalysisRecord = (record: AnalysisRecord): string =>
  JSON.stringify(analysisRecordSchema.parse(record));
