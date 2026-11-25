import { AIError, AIErrorCode } from "firebase/ai";
import type * as FirebaseAI from "firebase/ai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { boardFacts, cutoffFen } from "../../domain/study/position";
import { createStudyAI } from "./study-gemini";
const { generate, model } = vi.hoisted(() => ({
  generate: vi.fn(),
  model: vi.fn(),
}));
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
const archiveCall = (candidate: typeof locator, requested = true) => ({
  response: {
    inferenceSource: "in_cloud",
    functionCalls: () =>
      requested ? [{ name: "searchChessArchive", args: candidate }] : [],
  },
});
const selectMove = (notation: string, gameIndex = 0) => ({
  response: {
    inferenceSource: "in_cloud",
    functionCalls: () => [
      { name: "openVerifiedPosition", args: { gameIndex, notation } },
    ],
  },
});
it("opens the position before the sourced move only after replaying the complete score", async () => {
  generate
    .mockResolvedValueOnce(archiveCall(locator))
    .mockResolvedValueOnce(selectMove("1... Nf6"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(score)));
  const result = await createStudyAI()?.research(
    "knight development",
    new AbortController().signal,
  );
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
  expect(model.mock.calls[0]?.[1]).toMatchObject({
    mode: "only_in_cloud",
    inCloudParams: {
      tools: [
        {
          functionDeclarations: [
            { name: "searchChessArchive" },
            { name: "openVerifiedPosition" },
          ],
        },
      ],
    },
  });
});
it.each([
  [false, locator, score],
  [true, { ...locator, year: 1960 }, score],
  [true, { ...locator, san: "d5" }, score],
  [true, locator, score.replace("2. c4", "2. Qa8")],
])(
  "rejects unsupported searches, mismatched sources and ambiguous or illegal scores",
  async (searched, candidate, pgn) => {
    generate
      .mockResolvedValueOnce(archiveCall(candidate, searched))
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
it("distinguishes a rejected App Check token from a failed source check", async () => {
  generate.mockRejectedValue(
    new AIError(
      AIErrorCode.FETCH_ERROR,
      "Firebase App Check token is invalid.",
      { status: 401 },
    ),
  );
  await expect(
    createStudyAI()?.research("rook endings", new AbortController().signal),
  ).resolves.toEqual({ ok: false, error: "app-check" });
});
it("reports exhausted Gemini search quota without substituting a historical example", async () => {
  generate.mockRejectedValue(
    new AIError(AIErrorCode.FETCH_ERROR, "Resource exhausted", { status: 429 }),
  );
  expect(
    await createStudyAI()?.research(
      "queen sacrifice",
      new AbortController().signal,
    ),
  ).toEqual({ ok: false, error: "quota" });
});
it("reports other authorization failures as cloud unavailability", async () => {
  generate.mockRejectedValue(
    new AIError(AIErrorCode.FETCH_ERROR, "API access denied.", { status: 403 }),
  );
  await expect(
    createStudyAI()?.research("rook endings", new AbortController().signal),
  ).resolves.toEqual({ ok: false, error: "unavailable" });
});
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
  expect(model.mock.calls[1]?.[1]).toMatchObject({ mode: "only_on_device" });
});
