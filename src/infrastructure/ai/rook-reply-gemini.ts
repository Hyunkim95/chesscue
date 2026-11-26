import { reflectionSchema } from "../../domain/material/reflection";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
} from "firebase/ai";
import { z } from "zod";

import type { CoachMoment } from "../../domain/game/coach-moments";
import {
  rookIntents,
  type RookReplyChoice,
} from "../../domain/game/rook-reply";
import { initializeFirebaseClient } from "../firebase/firebase-client";
import { detectOnDeviceCapability } from "./on-device-capability";

const choiceSchema = z
  .object({
    intent: z.enum(rookIntents),
    ply: z.number().int().positive().optional(),
    question: reflectionSchema.optional(),
  })
  .strict();

export async function chooseRookReply(
  message: string,
  moments: readonly CoachMoment[],
  signal: AbortSignal,
): Promise<RookReplyChoice | undefined> {
  const capability = await detectOnDeviceCapability();
  if (capability.status !== "available" || signal.aborted) return undefined;
  const client = initializeFirebaseClient();
  if (client.status !== "ready") return undefined;
  const model = getGenerativeModel(
    getAI(client.services.app, { backend: new GoogleAIBackend() }),
    {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
        },
        promptOptions: {
          responseConstraint: {
            type: "object",
            properties: {
              intent: { type: "string", enum: rookIntents },
              ply: { type: "integer" },
            },
            required: ["intent"],
            additionalProperties: false,
          },
        },
      },
    },
    { timeout: 2_500 },
  );
  const result = await model.generateContent(
    JSON.stringify({
      task: "Classify the player's turn. For a past move, select a ply from the supplied checked observations if relevant. For a current-move suggestion request, use live-move. For the player's explanation of their thinking, use reflect. For reflect and explain, write one retrospective question about what the player intended or expected. It must contain no move notation, forecast or advice about the live position.",
      message,
      observations: moments,
    }),
    { signal },
  );
  if (result.response.inferenceSource !== InferenceSource.ON_DEVICE)
    return undefined;
  const choice = choiceSchema.parse(JSON.parse(result.response.text()));
  if (
    choice.ply !== undefined &&
    !moments.some(({ ply }) => ply === choice.ply)
  )
    return undefined;
  return {
    intent: choice.intent,
    ...(choice.ply === undefined ? {} : { ply: choice.ply }),
    ...(choice.question ? { question: choice.question } : {}),
  };
}
