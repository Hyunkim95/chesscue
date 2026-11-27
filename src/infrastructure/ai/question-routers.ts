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
  NO_DANGER,
  questionIntents,
  type DangerContext,
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

// Spot the danger: the model picks the checked fact the learner's words
// describe, from a closed list, so a partial answer can get a nudge.
const DANGER_SYSTEM = [
  "A chess learner says what they think is in danger on their own side of the board.",
  "You get their words and a list of checked facts about the position, each with an id.",
  "Return the id of the one fact their words describe, or none when they describe none of them.",
  "Naming a piece, its square or what attacks it is enough to match that piece's fact.",
  "Never choose a fact the learner did not describe.",
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

// Only an id from the supplied list, or none, is a reading.
export function parseDangerReading(
  text: string,
  ids: readonly string[],
): string | undefined {
  const allowed: [string, ...string[]] = [NO_DANGER, ...ids];
  try {
    const checked = z
      .object({ fact: z.enum(allowed) })
      .strict()
      .safeParse(JSON.parse(text));
    return checked.success ? checked.data.fact : undefined;
  } catch {
    return undefined;
  }
}

function dangerConstraint(ids: readonly string[]) {
  return {
    type: "object",
    properties: { fact: { type: "string", enum: [NO_DANGER, ...ids] } },
    required: ["fact"],
    additionalProperties: false,
  } as const;
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
  const ai = getAI(firebase.services.app, { backend: new GoogleAIBackend() });
  const generative = (
    system: string,
    constraint: Readonly<Record<string, unknown>>,
  ) =>
    getGenerativeModel(
      ai,
      route === "device"
        ? {
            mode: InferenceMode.ONLY_ON_DEVICE,
            onDeviceParams: {
              createOptions: {
                expectedInputs: [{ type: "text", languages: ["en"] }],
                expectedOutputs: [{ type: "text", languages: ["en"] }],
                initialPrompts: [
                  {
                    role: "system",
                    content: [{ type: "text", value: system }],
                  },
                ],
              },
              promptOptions: { responseConstraint: constraint },
            },
          }
        : {
            mode: InferenceMode.ONLY_IN_CLOUD,
            inCloudParams: {
              model: FLASH_ROUTER_MODEL,
              systemInstruction: system,
              generationConfig: {
                responseMimeType: "application/json",
                responseJsonSchema: constraint,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              },
            },
          },
      { timeout: TIMEOUT_MS },
    );
  const model = generative(SYSTEM, responseConstraint);
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
    // The fact ids change with the position, so each reading gets a model
    // constrained to that position's ids.
    async readDanger({ text, facts }: DangerContext, signal) {
      const ids = facts.map(({ id }) => id);
      try {
        const result = await generative(
          DANGER_SYSTEM,
          dangerConstraint(ids),
        ).generateContent(JSON.stringify({ message: text, facts }), {
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        });
        return result.response.inferenceSource === expected
          ? parseDangerReading(result.response.text(), ids)
          : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

export const createFlashQuestionRouter = () => router("cloud");
export const createNanoQuestionRouter = () => router("device");
