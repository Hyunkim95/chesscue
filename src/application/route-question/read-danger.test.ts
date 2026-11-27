import { expect, it } from "vitest";

import { dangerFacts } from "../../domain/analysis/danger-facts";
import type { QuestionRouter } from "./question-router";
import { readDanger } from "./read-danger";

// Black to move after White's Nxd4: the queen on e6 can be won, the knight
// on c6 is attacked but safe.
const facts =
  dangerFacts(
    "2kr3r/1pp2pp1/p1nbqn2/3p3p/3N4/1P2P1P1/PBP2PBP/R2QK2R b KQ - 0 13",
  ) ?? [];
const signal = new AbortController().signal;

function nano(answer: string | undefined) {
  const asked: { text: string; ids: string[] }[] = [];
  const router: QuestionRouter = {
    model: "Gemini Nano",
    route: () => Promise.resolve(undefined),
    readDanger: (context) => {
      asked.push({
        text: context.text,
        ids: context.facts.map(({ id }) => id),
      });
      return Promise.resolve(answer);
    },
    pickHint: () => Promise.resolve(undefined),
  };
  return { router, asked };
}

it("labels the fact the model matched and sends only the checked facts", async () => {
  const { router, asked } = nano("attacked-but-safe:c6");
  expect(
    await readDanger({
      text: "the knight can take my knight on c6",
      facts,
      router,
      signal,
    }),
  ).toEqual({
    kind: "read",
    factId: "attacked-but-safe:c6",
    understood: "Gemini Nano understood · knight on c6 attacked",
  });
  expect(asked).toEqual([
    {
      text: "the knight can take my knight on c6",
      ids: facts.map(({ id }) => id),
    },
  ]);
});

it("reads none as a nudge", async () => {
  expect(
    await readDanger({
      text: "nothing?",
      facts,
      router: nano("none").router,
      signal,
    }),
  ).toEqual({
    kind: "read",
    factId: undefined,
    understood: "Gemini Nano understood · no danger named",
  });
});

it("rejects an id that is not one of the facts", async () => {
  expect(
    await readDanger({
      text: "my rook",
      facts,
      router: nano("wins-material:d8").router,
      signal,
    }),
  ).toEqual({ kind: "unrouted" });
});

it("falls back when there is no model or it fails", async () => {
  expect(
    await readDanger({ text: "my queen", facts, router: undefined, signal }),
  ).toEqual({ kind: "unrouted" });
  expect(
    await readDanger({
      text: "my queen",
      facts,
      router: nano(undefined).router,
      signal,
    }),
  ).toEqual({ kind: "unrouted" });
});
