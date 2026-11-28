import { z } from "zod";
import { exerciseSchema } from "./verified";

const unitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  exercises: z.tuple([exerciseSchema, exerciseSchema]),
});

export type CurriculumUnit = z.infer<typeof unitSchema>;

export const installedCurriculumSchema = z
  .object({
    version: z.literal(1),
    runId: z.uuid(),
    stages: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1),
          units: z.array(unitSchema).min(1),
        }),
      )
      .length(4),
  })
  .refine(({ stages, runId }) => {
    const units = stages.flatMap(({ units }) => units);
    const exercises = units.flatMap(({ exercises }) => exercises);
    return (
      units.length === 21 &&
      new Set(stages.map(({ id }) => id)).size === stages.length &&
      new Set(units.map(({ id }) => id)).size === 21 &&
      new Set(exercises.map(({ id }) => id)).size === exercises.length &&
      new Set(exercises.map(({ fen }) => fen.split(" ").slice(0, 4).join(" ")))
        .size === exercises.length &&
      exercises.every(({ authorship }) => authorship.runId === runId)
    );
  }, "The installed curriculum must have 21 distinct units and two verified positions per unit.");
