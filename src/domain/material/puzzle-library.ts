import { z } from "zod";

import { reflectionSchema } from "./reflection-schema";
import {
  checkedLine,
  engineProofSchema,
  exerciseSchema,
  generationSchema,
  sourceSchema,
} from "./verified";

const key = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.number().int().positive();
const name = z.string().trim().min(1).max(250);

export const libraryMotifSchema = z.object({
  schemaVersion: z.literal(1),
  id: key,
  version,
  name,
});

export const libraryCourseSchema = z.object({
  schemaVersion: z.literal(1),
  id: key,
  motifId: key,
  motifVersion: version,
  version,
  title: name,
  goal: z.string().trim().min(1).max(1000),
  puzzleIds: z.array(key),
});

const puzzleRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: key,
  motifId: key,
  motifVersion: version,
  fen: z.string(),
  acceptableMoves: z.array(z.string()),
  solution: z.array(z.string()).min(1).max(20),
  rating: z.number().int().positive().nullable(),
  question: z.string(),
  explanation: z.string(),
  source: z.union([
    sourceSchema
      .omit({ url: true })
      .extend({ game: z.url().startsWith("https://lichess.org/") }),
    sourceSchema
      .omit({ url: true })
      .extend({
        submittedGameId: key,
        game: z
          .url()
          .regex(
            /^https:\/\/[a-z0-9-]+\.web\.app\/\?sharedGame=[0-9a-f]{64}&ply=[0-9]+$/,
          ),
      })
      .refine(
        (s) =>
          s.submittedGameId === s.sourceHash &&
          s.game.endsWith(
            "?sharedGame=" + s.submittedGameId + "&ply=" + String(s.ply - 1),
          ),
      ),
  ]),
  verification: engineProofSchema.omit({ toleranceCp: true }),
  authorship: generationSchema,
});

export const libraryPuzzleSchema = puzzleRecordSchema.transform(
  (record, context) => {
    const submitted = "submittedGameId" in record.source;
    const exercise = exerciseSchema.safeParse({
      ...record,
      id: "archive-library-" + record.id,
      version: String(record.motifVersion) + ".0.0",
      theme: submitted ? "one-move-threat" : "other",
      difficulty: "close",
      prompt:
        reflectionSchema.safeParse(record.question).data ??
        "Which move would you play here?",
      provenance: submitted
        ? "Position from a submitted ChessCue game."
        : "Position from the Lichess puzzle database.",
      source: { ...record.source, url: record.source.game },
      verification: { ...record.verification, toleranceCp: 35 },
    });
    if (
      !exercise.success ||
      submitted !== (record.rating === null) ||
      !record.acceptableMoves.includes(record.solution[0] ?? "") ||
      !checkedLine(record.fen, record.solution)
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid published puzzle.",
      });
      return z.NEVER;
    }
    return {
      id: record.id,
      motifId: record.motifId,
      motifVersion: record.motifVersion,
      version: record.motifVersion,
      rating: record.rating,
      exercise: exercise.data,
    };
  },
);

export const librarySeedSchema = z.object({
  motifs: z.array(libraryMotifSchema),
  curricula: z.array(libraryCourseSchema),
  puzzles: z.array(libraryPuzzleSchema),
});

export type LibraryPuzzle = z.output<typeof libraryPuzzleSchema>;
export type LibraryMotif = z.output<typeof libraryMotifSchema>;
export type LibraryCourse = z.output<typeof libraryCourseSchema>;
