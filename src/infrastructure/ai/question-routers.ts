import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  ThinkingLevel,
} from "firebase/ai";
import { z } from "zod";

import {
  questionIntents,
  type QuestionContext,
  type QuestionIntent,
  type QuestionRouter,
} from "../../application/route-question/question-router";
import { initializeFirebaseClient } from "../firebase/firebase-client";

// The routing prompt from research_notes/rook-intent-spike: Gemini 3.8 Flash
// routed 30/30 and 11/12 threat questions; Gemini Nano 28/30 and 9/12. The
// model returns only an intent; code takes moves from notation or the board.
const SYSTEM = [
  "You route a chess learner's message during a review of a position.",
  "Choose the intent:",
  "why = asks the reason a specific move is good or bad;",
  "what-if = proposes trying a move to see what happens;",
  "show = wants the coach to show the better move or line;",
  "hint = wants a hint;",
  "threats = asks what the opponent threatens, could capture or is attacking, or whether their own pieces or king are in danger;",
  "reflect = explains what they were thinking or planning;",
  "other = anything else.",
].join(" ");

const responseSchema = z.object({ intent: z.enum(questionIntents) }).strict();
const responseConstraint = {
  type: "object",
  properties: { intent: { type: "string", enum: [...questionIntents] } },
  required: ["intent"],
  additionalProperties: false,
} as const;

export const FLASH_ROUTER_MODEL = "gemini-3.8-flash";
const TIMEOUT_MS = 8_000;

function prompt({ text, learnerPlayed, legalMoves }: QuestionContext): string {
  return JSON.stringify({ message: text, learnerPlayed, legalMoves });
}

function parse(text: string): QuestionIntent | undefined {
  try {
    const checked = responseSchema.safeParse(JSON.parse(text));
    return checked.success ? checked.data.intent : undefined;
  } catch {
    return undefined;
  }
}

function router(route: "device" | "cloud"): QuestionRouter | undefined {
  if (
    route === "device" &&
    (typeof window === "undefined" || window.LanguageModel === undefined)
  )
    return undefined;
  const firebase = initializeFirebaseClient({
    enableAppCheck: true,
    appCheckDebug:
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true",
  });
  if (firebase.status !== "ready") return undefined;
  const model = getGenerativeModel(
    getAI(firebase.services.app, { backend: new GoogleAIBackend() }),
    route === "device"
      ? {
          mode: InferenceMode.ONLY_ON_DEVICE,
          onDeviceParams: {
            createOptions: {
              expectedInputs: [{ type: "text", languages: ["en"] }],
              expectedOutputs: [{ type: "text", languages: ["en"] }],
              initialPrompts: [
                { role: "system", content: [{ type: "text", value: SYSTEM }] },
              ],
            },
            promptOptions: { responseConstraint },
          },
        }
      : {
          mode: InferenceMode.ONLY_IN_CLOUD,
          inCloudParams: {
            model: FLASH_ROUTER_MODEL,
            systemInstruction: SYSTEM,
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: responseConstraint,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          },
        },
    { timeout: TIMEOUT_MS },
  );
  const expected =
    route === "device" ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD;
  return {
    model: route === "device" ? "Gemini Nano" : "Gemini Flash",
    async route(context, signal) {
      try {
        const result = await model.generateContent(prompt(context), {
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        });
        return result.response.inferenceSource === expected
          ? parse(result.response.text())
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

export const createFlashQuestionRouter = () => router("cloud");
export const createNanoQuestionRouter = () => router("device");
