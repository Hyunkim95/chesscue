import { starterPack } from "../material/pack";
import type { VerifiedTransferExercise } from "./types";
import { validateGeneratedTransferExercise } from "./validate";

const candidates: readonly VerifiedTransferExercise[] =
  starterPack.positions.map((item) => ({
    schemaVersion: 1,
    id: item.id,
    version: "2.0.0",
    theme: item.theme,
    difficulty: item.difficulty,
    fen: item.fen,
    acceptableMoves: item.acceptableMoves,
    prompt: item.question,
    explanation: item.insight,
    verification: item.verification,
    provenance: [
      item.authorship.model,
      item.authorship.runId,
      item.source.url,
      item.source.sourceHash,
    ].join(" · "),
    authorship: item.authorship,
    source: item.source,
  }));
export const generatedTransferRegistry: readonly VerifiedTransferExercise[] =
  Object.freeze(
    candidates.flatMap((candidate) => {
      const validated = validateGeneratedTransferExercise(candidate);
      return validated.ok ? [validated.exercise] : [];
    }),
  );

export const transferExercisesForTheme = (
  theme: VerifiedTransferExercise["theme"],
): readonly VerifiedTransferExercise[] =>
  generatedTransferRegistry.filter((exercise) => exercise.theme === theme);
