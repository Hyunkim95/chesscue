import { expect, test } from "vitest";

import { classifyExperiment } from "../../domain/analysis/classify-experiment";

test("compares evaluations from the learner's side before deciding to intervene", () => {
  const before = { line: ["b1c3"], evaluationCpFromSideToMove: 60 };
  expect(
    classifyExperiment("g2g4", before, {
      line: ["d8h4"],
      evaluationCpFromSideToMove: 99_999,
    }),
  ).toBe("spot");
  expect(
    classifyExperiment("b1c3", before, {
      line: ["g8f6"],
      evaluationCpFromSideToMove: -55,
    }),
  ).toBe("continue");
});

test("praises a standout when the next candidate is materially worse", () => {
  const before = {
    line: ["b1c3"],
    evaluationCpFromSideToMove: 200,
    alternativeEvaluationCp: 30,
  };
  const after = { line: ["g8f6"], evaluationCpFromSideToMove: -195 };
  expect(classifyExperiment("b1c3", before, after)).toBe("standout");
  expect(classifyExperiment("b1a3", before, after)).toBe("continue");
});

test("treats different distances to the same mate outcome as comparable", () => {
  expect(
    classifyExperiment(
      "b1c3",
      {
        line: ["b1c3"],
        evaluationCpFromSideToMove: 99_999,
        alternativeEvaluationCp: 99_700,
      },
      {
        line: ["g8f6"],
        evaluationCpFromSideToMove: -99_700,
      },
    ),
  ).toBe("continue");
});
