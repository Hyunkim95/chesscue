import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  forgetGeminiKey,
  GEMINI_KEY_CHANGE,
  readGeminiKey,
  saveGeminiKey,
} from "../persistence/gemini-key";
import { checkGeminiKey, playerGemini } from "./player-gemini";

const KEY = "AIza" + "a".repeat(35);
const options = {
  model: "gemini-3.8-flash",
  system: "Answer in JSON.",
  schema: { type: "object" },
  thinkingLevel: "LOW",
  timeoutMs: 1_000,
} as const;
const signal = new AbortController().signal;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("keeps only a well-formed key, and says when it changes", () => {
  const changes = vi.fn();
  window.addEventListener(GEMINI_KEY_CHANGE, changes);
  expect(saveGeminiKey("not a key")).toBe(false);
  expect(readGeminiKey()).toBeUndefined();
  expect(saveGeminiKey(`  ${KEY}\n`)).toBe(true);
  expect(readGeminiKey()).toBe(KEY);
  forgetGeminiKey();
  expect(readGeminiKey()).toBeUndefined();
  expect(changes).toHaveBeenCalledTimes(2);
  window.removeEventListener(GEMINI_KEY_CHANGE, changes);
});

it("keeps a key in any shape Google issues, and refuses obvious non-keys", () => {
  // Newer AI Studio keys are not the classic 39-character AIza form.
  const newer = "AQ." + "Ab8RN6".repeat(9) + "-x_Y";
  expect(saveGeminiKey(newer)).toBe(true);
  expect(readGeminiKey()).toBe(newer);
  for (const text of [
    "",
    "my key",
    "short",
    "https://aistudio.google.com/apikey",
  ])
    expect(saveGeminiKey(text)).toBe(false);
  expect(readGeminiKey()).toBe(newer);
});

it("has no cloud model without a key", () => {
  expect(playerGemini(options)).toBeUndefined();
});

it("sends the key in a header, never the URL, and returns the answer text", async () => {
  saveGeminiKey(KEY);
  const fetch = vi.fn(() =>
    Promise.resolve(
      reply({
        candidates: [
          {
            content: {
              parts: [{ text: "thinking", thought: true }, { text: '{"a":1}' }],
            },
          },
        ],
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  expect(await playerGemini(options)?.generate("input", signal)).toBe(
    '{"a":1}',
  );
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
  );
  expect(url).not.toContain(KEY);
  expect(init.headers).toMatchObject({ "x-goog-api-key": KEY });
  expect(
    JSON.parse(typeof init.body === "string" ? init.body : ""),
  ).toMatchObject({
    systemInstruction: { parts: [{ text: "Answer in JSON." }] },
    contents: [{ parts: [{ text: "input" }] }],
    generationConfig: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "LOW" },
    },
  });
});

it("returns nothing on an error, a malformed reply or a removed key", async () => {
  saveGeminiKey(KEY);
  const model = playerGemini(options);
  vi.stubGlobal("fetch", () => Promise.resolve(reply({ error: {} }, 429)));
  expect(await model?.generate("input", signal)).toBeUndefined();
  vi.stubGlobal("fetch", () => Promise.resolve(reply({ candidates: "x" })));
  expect(await model?.generate("input", signal)).toBeUndefined();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  forgetGeminiKey();
  expect(await model?.generate("input", signal)).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
});

it("tells a rejected key from an unreachable service", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve(reply({ models: [] })));
  expect(await checkGeminiKey(KEY, signal)).toEqual({ status: "ok" });
  vi.stubGlobal("fetch", () => Promise.resolve(reply({}, 400)));
  expect(await checkGeminiKey(KEY, signal)).toEqual({ status: "rejected" });
  vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
  expect(await checkGeminiKey(KEY, signal)).toEqual({ status: "unreachable" });
});
