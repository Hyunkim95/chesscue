import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
} from "firebase/ai";
import { z } from "zod";

import { initializeFirebaseClient } from "../firebase/firebase-client";
import { detectOnDeviceCapability } from "./on-device-capability";

const prompts = {
  change: "What did this move change?",
  squares: "What do the highlighted squares tell you?",
  reply: "How would you respond here?",
  alternative: "What would you try from the previous position?",
} as const;
const choices = ["change", "squares", "reply", "alternative"] as const;
const schema = z.object({ focus: z.enum(choices) }).strict();
const timeoutMs = 35_000;

export interface ExplorationEvidence {
  readonly fen: string;
  readonly moves: readonly string[];
  readonly continuation: readonly string[];
  readonly observation: string;
  readonly evaluationCp: number | undefined;
  readonly message: string;
  readonly priorTurns: readonly string[];
  readonly topic?: string | undefined;
}

// Loaded on demand by rook-exploration-gemini.ts so Firebase stays out of the
// first-load bundle (SLO-014).
export function createOnDeviceRookExplorationCoach() {
  const client = initializeFirebaseClient();
  if (client.status !== "ready") return null;
  const model = getGenerativeModel(
    getAI(client.services.app, { backend: new GoogleAIBackend() }),
    {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
          initialPrompts: [
            {
              role: "system",
              content: [
                {
                  type: "text",
                  value:
                    "You are Rook, a chess coach. Choose a question to help this learner notice something in the verified line. Use change for the consequence of a move, squares to focus on board highlights, reply for finding a response, or alternative for comparing a different try. Return only the focus key in JSON.",
                },
              ],
            },
          ],
        },
        promptOptions: {
          responseConstraint: {
            type: "object",
            properties: { focus: { type: "string", enum: [...choices] } },
            required: ["focus"],
            additionalProperties: false,
          },
        },
      },
    },
  );
  let pending: Promise<unknown> = Promise.resolve();

  return {
    initialize: () => model.initializeDeviceModel(),
    async ask(
      evidence: ExplorationEvidence,
      signal: AbortSignal,
    ): Promise<string | null> {
      const deadline = AbortSignal.any([
        signal,
        AbortSignal.timeout(timeoutMs),
      ]);
      const response = pending
        .then(async () => {
          const capability = await detectOnDeviceCapability();
          if (capability.status !== "available") return null;
          deadline.throwIfAborted();
          const result = await model.generateContent(
            JSON.stringify({ ...evidence, prompts }),
            {
              signal: deadline,
            },
          );
          if (result.response.inferenceSource !== InferenceSource.ON_DEVICE)
            return null;
          const checked = schema.safeParse(JSON.parse(result.response.text()));
          return checked.success ? prompts[checked.data.focus] : null;
        })
        .catch(() => null);
      pending = response;
      if (deadline.aborted) return null;
      let onAbort = (): void => undefined;
      try {
        return await Promise.race([
          response,
          new Promise<null>((resolve) => {
            onAbort = () => {
              resolve(null);
            };
            deadline.addEventListener("abort", onAbort, { once: true });
          }),
        ]);
      } finally {
        deadline.removeEventListener("abort", onAbort);
      }
    },
  };
}
