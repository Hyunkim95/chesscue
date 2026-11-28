import type * as FirebaseAI from "firebase/ai";
import { InferenceSource } from "firebase/ai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { saveGeminiKey } from "../persistence/gemini-key";
import {
  createFlashQuestionRouter,
  createNanoQuestionRouter,
  parseDangerReading,
} from "./question-routers";

const { generate, model } = vi.hoisted(() => ({
  generate: vi.fn(),
  model: vi.fn(),
}));
vi.mock("../firebase/firebase-client", () => ({
  initializeFirebaseClient: () => ({ status: "ready", services: { app: {} } }),
}));
vi.mock("firebase/ai", async (load) => ({
  ...(await load<typeof FirebaseAI>()),
  getAI: () => ({}),
  getGenerativeModel: model,
}));

const facts = [
  {
    id: "wins-material:e6",
    text: "The knight on d4 can win your queen on e6.",
  },
  {
    id: "attacked-but-safe:c6",
    text: "The knight on d4 attacks your knight on c6, but taking it wins nothing.",
  },
];
const signal = new AbortController().signal;

function answer(
  text: string,
  source: InferenceSource = InferenceSource.ON_DEVICE,
) {
  generate.mockResolvedValueOnce({
    response: { text: () => text, inferenceSource: source },
  });
}

beforeEach(() => {
  generate.mockReset();
  model.mockReset();
  model.mockReturnValue({ generateContent: generate });
  vi.stubGlobal("LanguageModel", {
    availability: () => Promise.resolve("available"),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function nano() {
  const router = createNanoQuestionRouter();
  if (!router) throw new Error("Expected the Nano router");
  return router;
}

it("returns the fact id Nano chose, constrained to the position's ids", async () => {
  answer('{"fact":"attacked-but-safe:c6"}');
  expect(
    await nano().readDanger(
      { text: "the knight can take my knight on c6", facts },
      signal,
    ),
  ).toBe("attacked-but-safe:c6");
  const options = model.mock.calls.at(-1)?.[1] as unknown;
  expect(options).toMatchObject({
    mode: "only_on_device",
    onDeviceParams: {
      promptOptions: {
        responseConstraint: {
          properties: {
            fact: {
              enum: ["none", "wins-material:e6", "attacked-but-safe:c6"],
            },
          },
        },
      },
    },
  });
  expect(JSON.parse(String(generate.mock.calls[0]?.[0]))).toEqual({
    message: "the knight can take my knight on c6",
    facts,
  });
});

it("rejects free text, unknown ids and answers from the cloud", async () => {
  answer("Your queen is attacked.");
  expect(await nano().readDanger({ text: "queen", facts }, signal)).toBe(
    undefined,
  );
  answer('{"fact":"wins-material:d8"}');
  expect(await nano().readDanger({ text: "rook", facts }, signal)).toBe(
    undefined,
  );
  answer('{"fact":"wins-material:e6"}', InferenceSource.IN_CLOUD);
  expect(await nano().readDanger({ text: "queen", facts }, signal)).toBe(
    undefined,
  );
  generate.mockRejectedValueOnce(new Error("model not ready"));
  expect(await nano().readDanger({ text: "queen", facts }, signal)).toBe(
    undefined,
  );
});

it("accepts only a supplied id or none", () => {
  const ids = facts.map(({ id }) => id);
  expect(parseDangerReading('{"fact":"none"}', ids)).toBe("none");
  expect(parseDangerReading('{"fact":"wins-material:e6"}', ids)).toBe(
    "wins-material:e6",
  );
  expect(
    parseDangerReading('{"fact":"wins-material:e6","why":"queen"}', ids),
  ).toBeUndefined();
  expect(
    parseDangerReading('{"fact":"mate-threat:e8e1"}', ids),
  ).toBeUndefined();
});

it("constrains hands-free intent to the currently supplied controls and moves", async () => {
  const router = nano();
  const context = {
    text: "take me through the rest",
    caption: "I have to play Kh8.",
    boardCanMove: true,
    controls: [{ id: "control-0", label: "Next step" }],
    moves: [{ id: "move-h8h7", san: "Kh7", uci: "h8h7" }],
  };
  answer('{"choice":"control-0"}');
  expect(await router.routeVoice?.(context, signal)).toBe("control-0");
  answer('{"choice":"move-a2a4"}');
  expect(await router.routeVoice?.(context, signal)).toBeUndefined();
  answer('{"choice":"none"}');
  expect(await router.routeVoice?.(context, signal)).toBe("none");
  expect(JSON.parse(String(generate.mock.calls[0]?.[0]))).toEqual(context);
});

it("routes through Flash only on the player's own key, never Firebase's cloud", async () => {
  localStorage.clear();
  expect(createFlashQuestionRouter()).toBeUndefined();
  saveGeminiKey("AIza" + "b".repeat(35));
  const fetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"intent":"why"}' }] } }],
        }),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const router = createFlashQuestionRouter();
  expect(router?.model).toBe("Gemini Flash");
  expect(
    await router?.route(
      { text: "why Nf3?", fen: "8/8/8/8/8/8/8/K6k w - - 0 1", legalMoves: [] },
      signal,
    ),
  ).toBe("why");
  expect(fetch).toHaveBeenCalledOnce();
  expect(model).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  localStorage.clear();
});
