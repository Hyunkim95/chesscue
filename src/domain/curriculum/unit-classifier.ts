import { z } from "zod";

// A softmax classifier from line-evidence facts to curriculum unit. Its
// weights are learned from Lichess puzzles tagged with each unit's own
// curriculum tags, so new units need training data rather than code.
export const unitClassifierSchema = z
  .object({
    schemaVersion: z.literal(1),
    trainedFrom: z.string().min(1),
    units: z.array(z.string().min(1)).min(2),
    vocabulary: z.array(z.string().min(1)).min(1),
    weights: z.array(z.array(z.number())),
  })
  .strict()
  .refine(
    ({ units, vocabulary, weights }) =>
      weights.length === units.length &&
      weights.every((row) => row.length === vocabulary.length + 1),
    "Each unit needs one weight per feature plus a bias.",
  );

export type UnitClassifier = z.infer<typeof unitClassifierSchema>;

export interface UnitPrediction {
  readonly unitId: string;
  readonly probability: number;
}

// The share of decisions on the dev and test sets where a prediction at or
// above this probability named the right unit was 85% and 83%.
export const MINIMUM_UNIT_PROBABILITY = 0.6;

// Pairs let a linear model learn combinations, such as a check that also
// attacks a second piece.
export function withFactPairs(facts: readonly string[]): string[] {
  const sorted = [...new Set(facts)].sort();
  return [
    ...sorted,
    ...sorted.flatMap((left, index) =>
      sorted.slice(index + 1).map((right) => left + "&" + right),
    ),
  ];
}

export function predictUnits(
  facts: readonly string[],
  classifier: UnitClassifier,
): UnitPrediction[] {
  const index = new Map(classifier.vocabulary.map((fact, i) => [fact, i]));
  const features = withFactPairs(facts).flatMap((feature) => {
    const position = index.get(feature);
    return position === undefined ? [] : [position];
  });
  const bias = classifier.vocabulary.length;
  const scores = classifier.weights.map((row) =>
    features.reduce((sum, i) => sum + (row[i] ?? 0), row[bias] ?? 0),
  );
  const highest = Math.max(...scores);
  const exponents = scores.map((score) => Math.exp(score - highest));
  const total = exponents.reduce((sum, value) => sum + value, 0);
  return classifier.units
    .map((unitId, i) => ({
      unitId,
      probability: (exponents[i] ?? 0) / total,
    }))
    .sort((a, b) => b.probability - a.probability);
}

export function confidentUnit(
  facts: readonly string[],
  classifier: UnitClassifier,
): UnitPrediction | undefined {
  const [best] = predictUnits(facts, classifier);
  return best && best.probability >= MINIMUM_UNIT_PROBABILITY
    ? best
    : undefined;
}
