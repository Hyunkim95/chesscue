import { z } from "zod";

const uciMoveSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/);

export const learningThemeSchema = z.enum([
  "hanging-piece",
  "one-move-threat",
  "premature-central-exchange",
  "king-safety",
  "development",
  "calculation",
  "endgame-technique",
  "other",
]);

export type LearningTheme = z.infer<typeof learningThemeSchema>;

export const analysisCandidateSchema = z
  .object({
    uci: uciMoveSchema,
    san: z.string().min(1).max(24).optional(),
    evaluationCp: z.number().int().min(-100_000).max(100_000),
    principalVariation: z.array(uciMoveSchema).max(20),
  })
  .strict();

export const moveAnalysisFactSchema = z
  .object({
    schemaVersion: z.literal(1),
    gameId: z.string().min(1),
    ply: z.number().int().positive(),
    fenBefore: z.string().min(1),
    playedMoveUci: uciMoveSchema,
    playedMoveSan: z.string().min(1).max(24),
    evaluationBeforeCp: z.number().int().min(-100_000).max(100_000),
    evaluationAfterCp: z.number().int().min(-100_000).max(100_000),
    impactCp: z.number().int().min(0).max(200_000),
    phase: z.enum(["opening", "middlegame", "endgame"]),
    theme: learningThemeSchema,
    recurrence: z.number().int().min(0).max(100),
    curricularRelevance: z.number().int().min(0).max(100),
    candidates: z.array(analysisCandidateSchema).min(1).max(5),
    analysisVersion: z.string().min(1).max(80),
  })
  .strict();

export type MoveAnalysisFact = z.infer<typeof moveAnalysisFactSchema>;

export interface LearningMoment {
  readonly id: string;
  readonly gameId: string;
  readonly ply: number;
  readonly fenBefore: string;
  readonly playedMoveUci: string;
  readonly playedMoveSan: string;
  readonly candidateMoveUci: string;
  readonly candidateMoveSan?: string;
  readonly impactCp: number;
  readonly theme: LearningTheme;
  readonly phase: MoveAnalysisFact["phase"];
  readonly analysisVersion: string;
  readonly trace: {
    readonly evaluationBeforeCp: number;
    readonly evaluationAfterCp: number;
    readonly recurrence: number;
    readonly curricularRelevance: number;
  };
}

export type FactValidationResult =
  | { readonly ok: true; readonly fact: MoveAnalysisFact }
  | { readonly ok: false; readonly reason: string };
