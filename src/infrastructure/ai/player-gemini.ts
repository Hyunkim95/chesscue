import { z } from "zod";

import { readGeminiKey } from "../persistence/gemini-key";

// Cloud Gemini on the player's own key, straight from the browser to
// Google's Gemini API (owner decision, 28 November 2026: ChessCue pays for no
// cloud AI). The key travels only in a header, never in a URL.
const API = "https://generativelanguage.googleapis.com/v1beta";

export interface PlayerGeminiOptions {
  readonly model: string;
  readonly system: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly thinkingLevel?: "LOW" | "MEDIUM" | "HIGH";
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly timeoutMs: number;
}

// "quota": the player's key hit its limit; "rejected": Google refused the
// key; "failed": anything else, including a timeout or an empty answer.
export type PlayerGeminiReply =
  | { readonly status: "ok"; readonly text: string }
  | { readonly status: "quota" | "rejected" | "failed" };

export interface PlayerGemini {
  request(input: string, signal: AbortSignal): Promise<PlayerGeminiReply>;
  // The model's JSON text, or undefined on any failure.
  generate(input: string, signal: AbortSignal): Promise<string | undefined>;
}

const response = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  thought: z.boolean().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export function hasPlayerGemini(): boolean {
  return readGeminiKey() !== undefined;
}

// undefined without a key. The key is read on every call, so saving or
// removing it applies at once.
export function playerGemini(
  options: PlayerGeminiOptions,
): PlayerGemini | undefined {
  if (!hasPlayerGemini()) return undefined;
  async function request(
    input: string,
    signal: AbortSignal,
  ): Promise<PlayerGeminiReply> {
    const key = readGeminiKey();
    if (!key) return { status: "rejected" };
    try {
      const result = await fetch(
        `${API}/models/${options.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": key,
          },
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(options.timeoutMs),
          ]),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: options.system }] },
            contents: [{ role: "user", parts: [{ text: input }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: options.schema,
              ...(options.maxOutputTokens === undefined
                ? {}
                : { maxOutputTokens: options.maxOutputTokens }),
              ...(options.temperature === undefined
                ? {}
                : { temperature: options.temperature }),
              ...(options.thinkingLevel === undefined
                ? {}
                : {
                    thinkingConfig: { thinkingLevel: options.thinkingLevel },
                  }),
            },
          }),
        },
      );
      if (result.status === 429) return { status: "quota" };
      if (
        result.status === 400 ||
        result.status === 401 ||
        result.status === 403
      )
        return { status: "rejected" };
      if (!result.ok) return { status: "failed" };
      const parsed = response.safeParse(await result.json());
      const parts = parsed.data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .filter(({ thought }) => thought !== true)
        .map(({ text: part }) => part ?? "")
        .join("");
      return text === "" ? { status: "failed" } : { status: "ok", text };
    } catch {
      return { status: "failed" };
    }
  }
  return {
    request,
    async generate(input, signal) {
      const reply = await request(input, signal);
      return reply.status === "ok" ? reply.text : undefined;
    },
  };
}

export type KeyCheck =
  | { readonly status: "ok" }
  | { readonly status: "rejected" | "unreachable" };

// Lists one model: costs no tokens and fails at once for a bad key.
export async function checkGeminiKey(
  key: string,
  signal: AbortSignal,
): Promise<KeyCheck> {
  try {
    const result = await fetch(`${API}/models?pageSize=1`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    });
    if (result.ok) return { status: "ok" };
    return {
      status:
        result.status === 400 || result.status === 401 || result.status === 403
          ? "rejected"
          : "unreachable",
    };
  } catch {
    return { status: "unreachable" };
  }
}
