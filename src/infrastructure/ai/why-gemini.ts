import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  ThinkingLevel,
} from "firebase/ai";
import { z } from "zod";

import type { WhyWriter } from "../../application/explain-why/explain-why";
import { initializeFirebaseClient } from "../firebase/firebase-client";

// The round 2 prompt from research_notes/why-explanations (cloud.mjs), with
// counts as fragments: Gemini 3.8 Flash gave a true answer with the real
// reason in 16 of 20 positions and no false claim. The validator still
// checks every answer before it is shown.
export const WHY_PROMPT = `You coach a club chess player who missed the best move in their own game. Explain in at most two short sentences WHY the best move is good: what it attacks, threatens or wins, and why the opponent's defences do not save them. The input was computed by chess software and is accurate. Address the player as "you". Rules:
- Use only the input's facts. Mention only moves, squares and pieces that appear in the input, and name an attacker, pinning piece or target only as the input names it.
- Material: never compute a count yourself. Counts in the input are the player's balance, such as "3 points ahead", "1 point behind" or "level". When you state material, use one of those exactly, as in "you end up 3 points ahead" or "material is level".
- If bestMoveCaptures.isRecapture is true, the best move only takes back a piece: say so, and explain why the other way of taking back (otherRecaptures, or yourGameMove) is worse, using its line.
- Do not call anything unstoppable, forced or free unless the input shows it (a line ending in checkmate, or canTakeBack empty).
- Do not just list the line.`;

export const WHY_MODEL = "gemini-3.8-flash";
// Inside SLO-013's 20 s, after the Stockfish searches.
const TIMEOUT_MS = 10_000;

const responseSchema = z.object({ why: z.string().min(1).max(600) }).strict();
const responseConstraint = {
  type: "object",
  properties: { why: { type: "string" } },
  required: ["why"],
  additionalProperties: false,
} as const;

export function parseWhy(text: string): string | undefined {
  try {
    const checked = responseSchema.safeParse(JSON.parse(text));
    return checked.success ? checked.data.why : undefined;
  } catch {
    return undefined;
  }
}

export function createFlashWhyWriter(): WhyWriter | undefined {
  const firebase = initializeFirebaseClient({
    enableAppCheck: true,
    appCheckDebug:
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true",
  });
  if (firebase.status !== "ready") return undefined;
  const ai = getAI(firebase.services.app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(
    ai,
    {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: WHY_MODEL,
        systemInstruction: WHY_PROMPT,
        generationConfig: {
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseJsonSchema: responseConstraint,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
    },
    { timeout: TIMEOUT_MS },
  );
  return {
    model: "Gemini Flash",
    async write(packet, signal) {
      try {
        const result = await model.generateContent(JSON.stringify(packet), {
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        });
        return result.response.inferenceSource === InferenceSource.IN_CLOUD
          ? parseWhy(result.response.text())
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}
