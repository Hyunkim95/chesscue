import { expect, test, vi } from "vitest";

import { ok } from "../../shared/result/result";
import {
  equalSearchReference,
  evaluateReviewReply,
  type ReviewReply,
} from "./analyze-review-reply";

test("stops the checked continuation when the exchange leaves bare kings", async () => {
  const engine = {
    initialize: () => Promise.resolve(ok(undefined)),
    analyze: () =>
      Promise.resolve(
        ok({
          candidates: [
            {
              uci: "d8d7",
              evaluationCpFromSideToMove: 0,
              principalVariation: ["d8d7", "d1d7", "e8d7", "e1f2", "d7c6"],
              depth: 15,
            },
          ],
        }),
      ),
    dispose: vi.fn(),
  };

  await expect(
    evaluateReviewReply(
      engine,
      "3rk3/3Q4/8/8/8/8/8/3RK3 b - - 0 1",
      new AbortController().signal,
    ),
  ).resolves.toEqual({
    line: ["d8d7", "d1d7", "e8d7"],
    evaluationCpFromSideToMove: 0,
  });
});

test("scores the best move by searching the position after it", async () => {
  const before = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
  const best: ReviewReply = {
    line: ["e2e4", "e8e7"],
    evaluationCpFromSideToMove: 900,
  };
  const evaluate = vi.fn(() =>
    Promise.resolve<ReviewReply>({
      line: ["e8e7"],
      evaluationCpFromSideToMove: -150,
    }),
  );
  const signal = new AbortController().signal;

  await expect(
    equalSearchReference(evaluate, best, { before, lan: "e2e3" }, signal),
  ).resolves.toEqual({ ...best, evaluationCpFromSideToMove: 150 });
  expect(evaluate).toHaveBeenCalledWith(
    "4k3/8/8/8/4P3/8/8/4K3 b - - 0 1",
    signal,
    false,
    "judgement",
  );

  evaluate.mockClear();
  await expect(
    equalSearchReference(evaluate, best, { before, lan: "e2e4" }, signal),
  ).resolves.toBe(best);
  expect(evaluate).not.toHaveBeenCalled();
});
