import { Chess } from "chess.js";
import type * as FirebaseAI from "firebase/ai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { cutoffFen } from "../../test/fixtures/study-position";
import { boardFacts } from "../../domain/study/position";
import { createStudyAI } from "./study-gemini";
const { generate, model, request, cloud } = vi.hoisted(() => ({
  generate: vi.fn(),
  model: vi.fn(),
  request: vi.fn(),
  cloud: vi.fn(),
}));
vi.mock("./player-gemini", () => ({ playerGemini: cloud }));
vi.mock("../firebase/firebase-client", () => ({
  initializeFirebaseClient: () => ({ status: "ready", services: { app: {} } }),
}));
vi.mock("firebase/ai", async (importOriginal) => {
  const original = await importOriginal<typeof FirebaseAI>();
  return { ...original, getAI: () => ({}), getGenerativeModel: model };
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("", { status: 503 })),
  );
  model.mockReturnValue({ generateContent: generate });
  cloud.mockReturnValue({ request });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const locator = {
  white: "Byrne",
  black: "Fischer",
  year: 1956,
  moveNumber: 1,
  side: "black",
  san: "Nf6",
};
const score =
  '[Event "Rosenwald"]\n[Date "1956.10.17"]\n[White "Byrne, Donald"]\n[Black "Fischer, Robert James"]\n[Result "0-1"]\n\n1. Nf3 Nf6 2. c4 g6 0-1';
// The player's key answers with JSON: a game locator, then one move.
const located = (candidate: typeof locator) => ({
  status: "ok",
  text: JSON.stringify(candidate),
});
const selectMove = (notation: string, gameIndex = 0) => ({
  status: "ok",
  text: JSON.stringify({
    gameIndex,
    notation,
    question: "What possibilities would you consider?",
  }),
});
it("opens the position before the sourced move only after replaying the complete score", async () => {
  request
    .mockResolvedValueOnce(located(locator))
    .mockResolvedValueOnce(selectMove("1... Nf6"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(score)));
  const result = await createStudyAI(() => ({
    initialize: () => Promise.resolve({ ok: true, value: undefined }),
    analyze: ({ fen }) => {
      const move = new Chess(fen).moves({ verbose: true })[0];
      if (!move) throw Error("Invalid fixture");
      return Promise.resolve({
        ok: true,
        value: {
          candidates: [
            {
              uci: move.lan,
              depth: 8,
              evaluationCpFromSideToMove: 15,
              principalVariation: [move.lan],
            },
          ],
        },
      });
    },
    dispose: vi.fn(),
  }))?.research("knight development", new AbortController().signal);
  expect(result).toMatchObject({
    ok: true,
    value: {
      orientation: "black",
      lesson: {
        fen: "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1",
        continuation: ["Nf6", "c4", "g6"],
      },
    },
  });
  expect(cloud.mock.calls[0]?.[0]).toMatchObject({
    model: "gemini-3.5-flash-lite",
    schema: { required: ["white", "black", "year"] },
  });
});
it.each([
  [{ status: "ok", text: "{}" }, locator, score],
  [located({ ...locator, year: 1960 }), locator, score],
  [located(locator), { ...locator, san: "d5" }, score],
  [located(locator), locator, score.replace("2. c4", "2. Qa8")],
])(
  "rejects unsupported searches, mismatched sources and ambiguous or illegal scores",
  async (search, candidate, pgn) => {
    request
      .mockResolvedValueOnce(search)
      .mockResolvedValueOnce(selectMove("1... " + candidate.san));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(new Response(pgn))),
    );
    expect(
      await createStudyAI()?.research(
        "development",
        new AbortController().signal,
      ),
    ).toEqual({ ok: false, error: "unverified" });
  },
);
it("asks for the player's own key before any cloud research", async () => {
  cloud.mockReturnValue(undefined);
  expect(
    await createStudyAI()?.research(
      "rook endings",
      new AbortController().signal,
    ),
  ).toEqual({ ok: false, error: "no-key" });
  expect(request).not.toHaveBeenCalled();
});
it.each([
  ["quota", "quota"],
  ["rejected", "key-rejected"],
  ["failed", "unavailable"],
] as const)(
  "reports a %s reply from the player's key without substituting an example",
  async (status, error) => {
    request.mockResolvedValue({ status });
    expect(
      await createStudyAI()?.research(
        "queen sacrifice",
        new AbortController().signal,
      ),
    ).toEqual({ ok: false, error });
  },
);
it("renders coverage from the rules if the model invents an attacker", async () => {
  const provider = createStudyAI();
  const message = "Which rook covers h2?",
    facts = boardFacts(cutoffFen, [], message);
  generate.mockResolvedValue({
    response: {
      inferenceSource: "on_device",
      text: () =>
        JSON.stringify({
          action: "answer",
          subject: "coverage",
          answer: "The black rook on d6 covers h2.",
        }),
    },
  });
  expect(
    await provider?.chat(
      { message, fen: cutoffFen, lesson: "", history: [], facts },
      new AbortController().signal,
    ),
  ).toEqual({
    action: "answer",
    answer: "White covers h2 with the rook on h1. No black piece covers h2.",
  });
});
it("requires a genuinely on-device response for position chat", async () => {
  const provider = createStudyAI(),
    input = {
      message: "Explain the plan",
      fen: cutoffFen,
      lesson: "rook endings",
      history: [],
      facts: boardFacts(cutoffFen, []),
    };
  const text = () =>
    JSON.stringify({
      action: "answer",
      answer: "Which file could the rook control?",
    });
  generate.mockResolvedValue({
    response: { inferenceSource: "in_cloud", text },
  });
  await expect(
    provider?.chat(input, new AbortController().signal),
  ).rejects.toThrow(/On-device/);
  generate.mockResolvedValue({
    response: { inferenceSource: "on_device", text },
  });
  await expect(
    provider?.chat(input, new AbortController().signal),
  ).resolves.toMatchObject({ action: "answer" });
  expect(model.mock.calls[0]?.[1]).toMatchObject({ mode: "only_on_device" });
});
