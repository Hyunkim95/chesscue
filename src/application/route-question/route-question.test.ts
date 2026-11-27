import { expect, it } from "vitest";

import type { QuestionIntent, QuestionRouter } from "./question-router";
import { routeQuestion } from "./route-question";

const FEN = "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35";
const signal = new AbortController().signal;

function router(
  model: string,
  intent: QuestionIntent | undefined,
): QuestionRouter {
  return { model, route: () => Promise.resolve(intent) };
}

const ask = (
  text: string,
  options: Partial<Parameters<typeof routeQuestion>[0]> = {},
) =>
  routeQuestion({
    text,
    fen: FEN,
    online: true,
    cloud: router("Gemini Flash", "threats"),
    device: router("Gemini Nano", "threats"),
    signal,
    ...options,
  });

it("acts at once online and labels the model", async () => {
  expect(await ask("what are you attacking?")).toEqual({
    kind: "act",
    action: { kind: "threats" },
    understood: "Gemini Flash understood · threats",
  });
});

it("confirms offline before acting", async () => {
  expect(await ask("what are you attacking?", { online: false })).toEqual({
    kind: "confirm",
    action: { kind: "threats" },
    label: "What are you threatening?",
    understood: "Gemini Nano understood · threats",
  });
});

it("takes the move from written notation, never from words", async () => {
  const cloud = router("Gemini Flash", "what-if");
  expect(await ask("what if I play gxf4", { cloud })).toMatchObject({
    kind: "act",
    action: { kind: "what-if", uci: "g3f4" },
    understood: "Gemini Flash understood · what-if · gxf4",
  });
  expect(await ask("what if my knight jumps forward", { cloud })).toEqual({
    kind: "play-it-on-the-board",
    understood: "Gemini Flash understood · what-if",
  });
  expect(
    await ask("what about this one", { cloud, boardMoveUci: "c3b3" }),
  ).toMatchObject({ kind: "act", action: { kind: "what-if", uci: "c3b3" } });
});

it("names a move already played on the shown frame", async () => {
  // Black's Kf6 was played to reach this frame, so it is not legal here.
  expect(
    await ask("why did you go there?", {
      online: false,
      device: router("Gemini Nano", "why"),
      boardMoveUci: "f7f6",
      boardMoveSan: "Kf6",
    }),
  ).toEqual({
    kind: "confirm",
    action: { kind: "why", uci: "f7f6" },
    label: "Why Kf6?",
    understood: "Gemini Nano understood · why · Kf6",
  });
});

it("falls back to the device model with confirmation when the cloud fails", async () => {
  expect(
    await ask("any danger?", { cloud: router("Gemini Flash", undefined) }),
  ).toMatchObject({
    kind: "confirm",
    understood: "Gemini Nano understood · threats",
  });
});

it("reports an unrouted question when no model answers", async () => {
  expect(
    await ask("hello", {
      online: false,
      device: router("Gemini Nano", undefined),
    }),
  ).toEqual({ kind: "unrouted" });
  expect(await ask("hello", { online: false, device: undefined })).toEqual({
    kind: "unrouted",
  });
});
