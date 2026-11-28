import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
} from "firebase/ai";
import { z } from "zod";

import {
  NO_DANGER,
  questionIntents,
  type DangerContext,
  type HintContext,
  type QuestionContext,
  type QuestionIntent,
  type QuestionRouter,
} from "../../application/route-question/question-router";
import { initializeFirebaseClient } from "../firebase/firebase-client";
import { hasPlayerGemini, playerGemini } from "./player-gemini";

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

const HINT_SYSTEM = [
  "A chess learner said what they see in a position.",
  "You get their words and a list of hints, each with an id and when to choose it.",
  "Return the id of the one hint whose condition best fits their words.",
].join(" ");

const VOICE_SYSTEM = [
  "Interpret a player's speech in a hands-free chess lesson.",
  "Use the caption and currently available controls to understand requests phrased in the player's own words.",
  "Choose a control only when the player clearly wants that action. A question that directly means a visible control can select it.",
  "Choose a supplied move id only for an instruction to play that exact move, never for a hypothetical, question, negation, or ambiguous description.",
  "Never recommend a move, infer missing squares, or pick a convenient legal move when the request is unclear.",
  "Choose clarify-move when the player wants to play a move but hasn't identified a unique legal move, if that choice is available.",
  "Return none for anything that doesn't clearly match one available action.",
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

export function parseHintPick(
  text: string,
  ids: readonly string[],
): string | undefined {
  const [first, ...rest] = ids;
  if (first === undefined) return undefined;
  try {
    const checked = z
      .object({ hint: z.enum([first, ...rest]) })
      .strict()
      .safeParse(JSON.parse(text));
    return checked.success ? checked.data.hint : undefined;
  } catch {
    return undefined;
  }
}

function hintConstraint(ids: readonly string[]) {
  return {
    type: "object",
    properties: { hint: { type: "string", enum: [...ids] } },
    required: ["hint"],
    additionalProperties: false,
  } as const;
}

function dangerConstraint(ids: readonly string[]) {
  return {
    type: "object",
    properties: { fact: { type: "string", enum: [NO_DANGER, ...ids] } },
    required: ["fact"],
    additionalProperties: false,
  } as const;
}

// Sends one prompt and returns the model's JSON text, or undefined.
type Generate = (
  system: string,
  constraint: Readonly<Record<string, unknown>>,
  input: string,
  signal: AbortSignal,
) => Promise<string | undefined>;

// Gemini Nano through Firebase's on-device route. undefined where the browser
// has no Prompt API.
function nanoGenerate(): Generate | undefined {
  if (typeof window === "undefined" || window.LanguageModel === undefined)
    return undefined;
  const firebase = initializeFirebaseClient({
    enableAppCheck: true,
    appCheckDebug:
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true",
  });
  if (firebase.status !== "ready") return undefined;
  const ai = getAI(firebase.services.app, { backend: new GoogleAIBackend() });
  return async (system, constraint, input, signal) => {
    const model = getGenerativeModel(
      ai,
      {
        mode: InferenceMode.ONLY_ON_DEVICE,
        onDeviceParams: {
          createOptions: {
            expectedInputs: [{ type: "text", languages: ["en"] }],
            expectedOutputs: [{ type: "text", languages: ["en"] }],
            initialPrompts: [
              { role: "system", content: [{ type: "text", value: system }] },
            ],
          },
          promptOptions: { responseConstraint: constraint },
        },
      },
      { timeout: TIMEOUT_MS },
    );
    const result = await model.generateContent(input, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    return result.response.inferenceSource === InferenceSource.ON_DEVICE
      ? result.response.text()
      : undefined;
  };
}

// Gemini Flash on the player's own key. undefined without one.
function flashGenerate(): Generate | undefined {
  if (!hasPlayerGemini()) return undefined;
  return (system, constraint, input, signal) =>
    playerGemini({
      model: FLASH_ROUTER_MODEL,
      system,
      schema: constraint,
      thinkingLevel: "LOW",
      timeoutMs: TIMEOUT_MS,
    })?.generate(input, signal) ?? Promise.resolve(undefined);
}

function router(
  model: QuestionRouter["model"],
  generate: Generate | undefined,
): QuestionRouter | undefined {
  if (!generate) return undefined;
  // Any failure reads as no answer, so Rook falls back to code.
  const ask = async (
    system: string,
    constraint: Readonly<Record<string, unknown>>,
    input: string,
    signal: AbortSignal,
  ) => {
    try {
      return await generate(system, constraint, input, signal);
    } catch {
      return undefined;
    }
  };
  return {
    model,
    async route(context, signal) {
      const text = await ask(
        SYSTEM,
        responseConstraint,
        prompt(context),
        signal,
      );
      return text === undefined ? undefined : parse(text);
    },
    // The fact ids change with the position, so each reading gets a model
    // constrained to that position's ids.
    async readDanger({ text, facts }: DangerContext, signal) {
      const ids = facts.map(({ id }) => id);
      const answer = await ask(
        DANGER_SYSTEM,
        dangerConstraint(ids),
        JSON.stringify({ message: text, facts }),
        signal,
      );
      return answer === undefined ? undefined : parseDangerReading(answer, ids);
    },
    async pickHint({ text, options }: HintContext, signal) {
      const ids = options.map(({ id }) => id);
      if (ids.length === 0) return undefined;
      const answer = await ask(
        HINT_SYSTEM,
        hintConstraint(ids),
        JSON.stringify({ message: text, hints: options }),
        signal,
      );
      return answer === undefined ? undefined : parseHintPick(answer, ids);
    },
    async routeVoice(context, signal) {
      const ids = [
        "none",
        ...(context.boardCanMove ? ["clarify-move"] : []),
        ...context.controls.map(({ id }) => id),
        ...context.moves.map(({ id }) => id),
      ] as const;
      const schema = z.object({ choice: z.enum(ids) }).strict();
      const constraint = {
        type: "object",
        properties: { choice: { type: "string", enum: ids } },
        required: ["choice"],
        additionalProperties: false,
      };
      const answer = await ask(
        VOICE_SYSTEM,
        constraint,
        JSON.stringify(context),
        signal,
      );
      if (answer === undefined) return undefined;
      try {
        const choice = schema.safeParse(JSON.parse(answer));
        return choice.success ? choice.data.choice : undefined;
      } catch {
        return undefined;
      }
    },
  };
}

// Flash runs on the player's own key, so this is undefined without one.
export const createFlashQuestionRouter = () =>
  router("Gemini Flash", flashGenerate());
export const createNanoQuestionRouter = () =>
  router("Gemini Nano", nanoGenerate());
