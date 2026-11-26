import { classifyMateMotif } from "./mate-motif-gemini";
import { sameTransferPosition } from "../../domain/transfer/validate";
import { sha256 } from "../../shared/sha256";
import {
  exerciseSchema,
  type AuthoredCue,
} from "../../domain/material/verified";
import { archiveExercise } from "../../domain/material/archive-exercise";
import type { VerifiedTransferExercise } from "../../domain/transfer/types";
import { createStudyAI } from "./study-gemini";
import { reflectionSchema } from "../../domain/material/reflection";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
} from "firebase/ai";
import { z } from "zod";

import type { VerifiedGameDrill } from "../../domain/curriculum/game-drill";
import { initializeFirebaseClient } from "../firebase/firebase-client";

const cueSchema = z.object({ question: reflectionSchema }).strict();
export const followUpDraftSchema = z
  .object({ followUpId: z.string().max(160), question: reflectionSchema })
  .strict();

function models() {
  const client = initializeFirebaseClient({
    enableAppCheck: true,
    appCheckDebug:
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true",
  });
  if (client.status !== "ready") throw new Error("Firebase AI is unavailable.");
  return getAI(client.services.app, { backend: new GoogleAIBackend() });
}

export async function draftOfflineCue(
  drill: VerifiedGameDrill,
  signal: AbortSignal,
): Promise<AuthoredCue> {
  const model = getGenerativeModel(
    models(),
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
              question: { type: "string" },
            },
            required: ["question"],
            additionalProperties: false,
          },
        },
      },
    },
    { timeout: 12_000 },
  );
  const prompt = JSON.stringify({
    task: "Author one short open-ended question about the learner’s thinking in this checked position. Ask about their decision or the reply they considered. Do not name moves, squares, numbers or assert a tactical outcome. Return JSON with question.",
    theme: drill.exercise.theme,
    phase: drill.phase,
    backRank: drill.backRank,
    checked: {
      played: drill.played,
      candidate: drill.candidate,
      line: drill.exercise.verification.principalVariation,
    },
  });
  const result = await model.generateContent(prompt, { signal });
  if (result.response.inferenceSource !== InferenceSource.ON_DEVICE)
    throw new Error("On-device inference was not confirmed.");
  const response = result.response.text();
  return {
    id: drill.exercise.id,
    fen: drill.exercise.fen,
    question: cueSchema.parse(JSON.parse(response)).question,
    authorship: {
      model: "Gemini Nano",
      route: "on-device",
      runId: crypto.randomUUID(),
      promptVersion: "local-drill-v2",
      promptHash: await sha256(prompt),
      responseHash: await sha256(response),
    },
  };
}

export async function draftCloudFollowUp(
  drill: VerifiedGameDrill,
  observations: number,
  signal: AbortSignal,
): Promise<
  | (z.infer<typeof followUpDraftSchema> & {
      exercise?: VerifiedTransferExercise;
    })
  | null
> {
  const archive = createStudyAI();
  if (archive) {
    const result = await archive.research(
      "Find a historical position for practice in " +
        (drill.backRank ? "back-rank checkmate" : drill.exercise.theme) +
        ". The engine’s best move must demonstrate the skill.",
      signal,
    );
    signal.throwIfAborted();
    if (!result.ok && result.error !== "unverified")
      throw new Error("Gemini Cloud research unavailable");
    const motif =
      result.ok && drill.backRank
        ? await classifyMateMotif(
            result.value.lesson.fen,
            result.value.proof.verification.bestMoveUci,
            "cloud",
            signal,
          ).catch(() => "uncertain" as const)
        : undefined;
    signal.throwIfAborted();
    const exercise = result.ok
      ? archiveExercise(drill, result.value, motif)
      : null;
    if (exercise)
      return { followUpId: exercise.id, question: exercise.prompt, exercise };
  }
  if (!drill.followUps.length) return null;
  const options = drill.followUps.map(
    ({ id, difficulty, theme, verification }) => ({
      id,
      difficulty,
      theme,
      checkedLine: verification.principalVariation,
    }),
  );
  const model = getGenerativeModel(
    models(),
    {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: "gemini-3.5-flash-lite",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: Schema.object({
            properties: {
              followUpId: Schema.string(),
              question: Schema.string(),
            },
          }),
        },
      },
    },
    { timeout: 20_000 },
  );
  const prompt = JSON.stringify({
    task: "Prepare a different exercise for the selected skill. Use one of the supplied engine-verified positions. Write a fresh, neutral, open-ended question about the learner’s decision, adapted to their experience. Do not reveal the answer or include chess claims, piece names, notation or numbers. Return the source followUpId and your question.",
    theme: drill.exercise.theme,
    phase: drill.phase,
    observations,
    options,
  });
  const result = await model.generateContent(prompt, { signal });
  if (result.response.inferenceSource !== InferenceSource.IN_CLOUD)
    throw new Error("Cloud inference was not confirmed.");
  const draft = followUpDraftSchema.parse(JSON.parse(result.response.text()));
  if (
    !options.some((item) => item.id === draft.followUpId) ||
    /mate|rook|pawn|king|bishop|knight|queen|check|capture|fork|castle|exchange/i.test(
      draft.question,
    )
  )
    throw new Error("Unverified follow-up or revealing prompt");
  const base = drill.followUps.find((item) => item.id === draft.followUpId);
  if (!base || sameTransferPosition(base.fen, drill.exercise.fen))
    throw Error("Follow-up must use a distinct verified board");
  const runId = crypto.randomUUID();
  const exercise = exerciseSchema.parse({
    ...base,
    difficulty: observations < 3 ? "close" : "unlabeled",
    id: "archive-" + runId,
    prompt: draft.question,
    provenance: "Gemini Cloud · " + base.source.url,
    authorship: {
      model: "gemini-3.5-flash-lite",
      route: "cloud" as const,
      runId,
      promptVersion: "transfer-question-v2",
      promptHash: await sha256(prompt),
      responseHash: await sha256(result.response.text()),
    },
  });
  return { followUpId: exercise.id, question: exercise.prompt, exercise };
}
