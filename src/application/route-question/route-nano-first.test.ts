import { expect, it, vi } from "vitest";

import type { QuestionIntent, QuestionRouter } from "./question-router";
import { routeNanoFirst } from "./route-nano-first";

const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
const signal = new AbortController().signal;

function router(model: string, intent: QuestionIntent | undefined) {
  const route = vi.fn(() => Promise.resolve(intent));
  const none = () => Promise.resolve(undefined);
  const made: QuestionRouter = {
    model,
    route,
    readDanger: none,
    pickHint: none,
  };
  return { router: made, route };
}

it("asks Nano first and Flash only when Nano has no answer", async () => {
  const nano = router("Gemini Nano", "hint");
  const flash = router("Gemini Flash", "threats");
  const ask = { text: "Any ideas?", fen: FEN, signal, online: true };

  expect(
    await routeNanoFirst({ ...ask, device: nano.router, cloud: flash.router }),
  ).toMatchObject({
    kind: "confirm",
    understood: "Gemini Nano understood · hint",
  });
  expect(flash.route).not.toHaveBeenCalled();

  const silent = router("Gemini Nano", undefined);
  expect(
    await routeNanoFirst({
      ...ask,
      device: silent.router,
      cloud: flash.router,
    }),
  ).toMatchObject({
    kind: "act",
    understood: "Gemini Flash understood · threats",
  });
  expect(flash.route).toHaveBeenCalledOnce();
});

it("uses Flash without Nano, and nothing offline", async () => {
  const flash = router("Gemini Flash", "hint");
  const ask = { text: "Any ideas?", fen: FEN, signal, device: undefined };
  expect(
    await routeNanoFirst({ ...ask, online: true, cloud: flash.router }),
  ).toMatchObject({ kind: "act" });
  expect(
    await routeNanoFirst({ ...ask, online: false, cloud: flash.router }),
  ).toEqual({ kind: "unrouted" });
  expect(flash.route).toHaveBeenCalledOnce();
});
