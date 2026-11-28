import { describe, expect, it } from "vitest";

import { curriculum } from "../material/installed-curriculum";
import { installedUnitClassifier } from "./installed-unit-classifier";
import {
  MINIMUM_UNIT_PROBABILITY,
  confidentUnit,
  predictUnits,
  unitClassifierSchema,
  withFactPairs,
} from "./unit-classifier";

const classifier = unitClassifierSchema.parse({
  schemaVersion: 1,
  trainedFrom: "fixture",
  units: ["double-attack", "count-captures"],
  vocabulary: ["capture-undefended", "check&double-attack"],
  weights: [
    [0, 4, 0],
    [3, 0, 0],
  ],
});

describe("unit classifier", () => {
  it("adds each pair of facts once, in a stable order", () => {
    expect(withFactPairs(["double-attack", "check", "check"])).toEqual([
      "check",
      "double-attack",
      "check&double-attack",
    ]);
  });

  it("ranks units by probability from facts and fact pairs", () => {
    const [best, second] = predictUnits(["double-attack", "check"], classifier);
    expect(best?.unitId).toBe("double-attack");
    expect(best?.probability).toBeCloseTo(Math.exp(4) / (Math.exp(4) + 1));
    expect(second?.unitId).toBe("count-captures");
  });

  it("only commits to a unit above the minimum probability", () => {
    expect(confidentUnit(["capture-undefended"], classifier)).toMatchObject({
      unitId: "count-captures",
    });
    // No known facts leaves both units equally likely.
    expect(MINIMUM_UNIT_PROBABILITY).toBeGreaterThan(0.5);
    expect(confidentUnit(["quiet"], classifier)).toBeUndefined();
  });

  it("rejects weights that do not match the units and features", () => {
    expect(
      unitClassifierSchema.safeParse({
        schemaVersion: 1,
        trainedFrom: "fixture",
        units: ["a", "b"],
        vocabulary: ["x"],
        weights: [[0, 0]],
      }).success,
    ).toBe(false);
  });

  it("only predicts units in the installed curriculum", () => {
    const installed = new Set(
      curriculum.stages.flatMap((stage) => stage.units.map(({ id }) => id)),
    );
    expect(
      installedUnitClassifier.units.filter((unit) => !installed.has(unit)),
    ).toEqual([]);
  });
});
