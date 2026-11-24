import { z } from "zod";

import { err, ok, type Result } from "../../shared/result/result";

const semanticVersion = /^\d+\.\d+\.\d+$/;

const runtimeConfigurationSchema = z
  .object({
    version: z.string().regex(semanticVersion),
    engine: z
      .object({
        moveTimeMs: z.number().int().min(100).max(5000),
        minimumElo: z.number().int().min(400).max(3190),
        maximumElo: z.number().int().min(400).max(3190),
      })
      .strict(),
    coaching: z
      .object({
        timeoutMs: z.number().int().min(1000).max(20000),
        model: z.string().min(1).max(100),
        promptVersion: z.string().regex(semanticVersion),
      })
      .strict(),
    enabledPlaybooks: z.array(z.string().min(1)).max(32),
  })
  .strict()
  .refine((value) => value.engine.minimumElo <= value.engine.maximumElo, {
    error: "Minimum Elo must not exceed maximum Elo.",
    path: ["engine", "minimumElo"],
  });

export type RuntimeConfiguration = z.infer<typeof runtimeConfigurationSchema>;

export interface RuntimeConfigurationFailure {
  readonly code: "invalid-configuration";
  readonly message: string;
}

export const parseRuntimeConfiguration = (
  value: unknown,
): Result<RuntimeConfiguration, RuntimeConfigurationFailure> => {
  const result = runtimeConfigurationSchema.safeParse(value);
  if (!result.success) {
    return err({
      code: "invalid-configuration",
      message: result.error.issues.map((issue) => issue.message).join(" "),
    });
  }
  return ok(result.data);
};

export const defaultRuntimeConfiguration: RuntimeConfiguration = {
  version: "1.0.0",
  engine: {
    moveTimeMs: 2000,
    minimumElo: 800,
    maximumElo: 2200,
  },
  coaching: {
    timeoutMs: 20000,
    model: "gemini-nano",
    promptVersion: "1.0.0",
  },
  enabledPlaybooks: ["tactics.hanging-piece@1.0.0"],
};
