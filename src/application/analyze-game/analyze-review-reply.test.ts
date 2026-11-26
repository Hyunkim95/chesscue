import { expect, test, vi } from "vitest";

import { ok } from "../../shared/result/result";
import { evaluateReviewReply } from "./analyze-review-reply";

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
