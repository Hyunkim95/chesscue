import { expect, it } from "vitest";

import type { QuestionRouter } from "./question-router";
import { pickHint } from "./pick-hint";

// The mock's position: Black to move after 13. Nxd4.
const fen = "2kr3r/1pp2pp1/p1nbqn2/3p3p/3N4/1P2P1P1/PBP2PBP/R2QK2R b KQ - 0 13";
const signal = new AbortController().signal;

function nano(answer: string | undefined) {
  const asked: string[][] = [];
  const router: QuestionRouter = {
    model: "Gemini Nano",
    route: () => Promise.resolve(undefined),
    readDanger: () => Promise.resolve(undefined),
    pickHint: (context) => {
      asked.push(context.options.map(({ id }) => id));
      return Promise.resolve(answer);
    },
  };
  return { router, asked };
}

it("uses the hint the model picks from the supplied list", async () => {
  const { router, asked } = nano("check-their-threats");
  const pick = await pickHint({
    text: "I want to attack",
    fen,
    router,
    signal,
  });
  expect(asked[0]).toContain("scan");
  expect(pick?.option.id).toBe("check-their-threats");
  expect(pick?.option.text).toMatch(
    /^Before you attack, check what White threatens\./,
  );
  expect(pick?.understood).toBe("Gemini Nano understood · your own plan");
});

it("gives no hint without a valid pick, so the screen keeps its nudge", async () => {
  expect(
    await pickHint({
      text: "hm",
      fen,
      router: nano("free text").router,
      signal,
    }),
  ).toBeUndefined();
  expect(
    await pickHint({ text: "hm", fen, router: undefined, signal }),
  ).toBeUndefined();
  expect(
    (await pickHint({ text: "help", fen, router: nano("scan").router, signal }))
      ?.option.id,
  ).toBe("scan");
});
