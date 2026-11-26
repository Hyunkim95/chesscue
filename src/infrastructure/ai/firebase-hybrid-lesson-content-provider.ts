import type { FirebaseApp } from "firebase/app";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
} from "firebase/ai";

import type { LessonContentRequest } from "../../domain/coaching/types";

import type {
  LessonContentProvider,
  LessonContentProviderResult,
} from "./lesson-content-provider";
import {
  detectOnDeviceCapability,
  type OnDeviceCapability,
} from "./on-device-capability";

const DEFAULT_CLOUD_MODEL = "gemini-3.5-flash-lite";
const MAX_PROMPT_CHARACTERS = 12_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 512;
export const ON_DEVICE_INFERENCE_TIMEOUT_MS = 120_000;
const CLOUD_REQUEST_TIMEOUT_MS = 10_000;

const systemInstruction = [
  "You personalize one step in a deterministic chess lesson playbook.",
  "Return only the requested JSON object.",
  "Use only the supplied moves, squares, numbers, and concepts.",
  "Do not change the objective, step, scoring, progression, mastery, or reinforcement.",
  "Keep explanations concise and suitable for a developing chess player.",
].join(" ");

export const lessonContentResponseSchema = Schema.object({
  properties: {
    stepId: Schema.string({
      description: "The exact supplied lesson step ID.",
    }),
    prompt: Schema.string({
      description: "A concise question for the current lesson step.",
    }),
    correctFeedback: Schema.string({
      description: "Concise feedback for a correct answer.",
    }),
    incorrectFeedback: Schema.string({
      description: "Concise feedback for an incorrect answer.",
    }),
    referencedMoves: Schema.array({ items: Schema.string(), maxItems: 8 }),
    referencedSquares: Schema.array({ items: Schema.string(), maxItems: 8 }),
    referencedNumbers: Schema.array({ items: Schema.number(), maxItems: 8 }),
  },
});

type FirebaseInferenceSource =
  | typeof InferenceSource.ON_DEVICE
  | typeof InferenceSource.IN_CLOUD;

interface HybridInferenceResult {
  readonly text: string;
  readonly inferenceSource: FirebaseInferenceSource | undefined;
}

export interface HybridInferenceClient {
  initializeDeviceModel(
    onDownloadProgress?: (progress: number) => void,
  ): Promise<void>;
  generate(prompt: string, signal: AbortSignal): Promise<HybridInferenceResult>;
}

export interface FirebaseHybridProviderOptions {
  readonly timeoutMs: number;
  readonly cloudModel?: string;
  readonly maxOutputTokens?: number;
  readonly capabilityDetector?: () => Promise<OnDeviceCapability>;
}

export interface CreateFirebaseHybridProviderOptions extends FirebaseHybridProviderOptions {
  readonly firebaseApp: FirebaseApp;
}

const mapProvenance = (
  source: FirebaseInferenceSource | undefined,
): LessonContentProviderResult["provenance"] => {
  if (source === InferenceSource.ON_DEVICE) return "on-device";
  if (source === InferenceSource.IN_CLOUD) return "cloud";
  throw new Error("Firebase AI Logic did not report an inference source.");
};

const buildPrompt = (request: LessonContentRequest): string => {
  const prompt = JSON.stringify({
    instruction:
      "kind" in request.facts
        ? "Author a short open-ended reflection question in the prompt field about the learner’s reasoning. Write no move notation or square names in the question. Moves and evaluation are rendered independently from the supplied engine facts."
        : "Fill only the bounded lesson content slots for this step.",
    playbook: {
      id: request.playbookId,
      version: request.playbookVersion,
    },
    step: {
      id: request.step.id,
      kind: request.step.kind,
      slot: request.step.promptSlot,
      fallbackPrompt: request.step.fallbackPrompt,
    },
    allowedFacts: {
      theme: request.facts.theme,
      fen: request.facts.fen,
      ...("kind" in request.facts
        ? {
            playedMove: request.facts.playedMove,
            bestMove: request.facts.bestMove,
          }
        : {
            endangeredSquare: request.facts.endangeredSquare,
            threatenedMove: request.facts.threatenedMove,
          }),
      acceptableMoves: request.facts.acceptableMoves,
      reasonCodes: request.facts.reasonCodes,
      transferMoves: request.facts.transferMoves,
      allowedNumbers: request.facts.allowedNumbers,
    },
    output: {
      stepId: request.step.id,
      requiredFields: [
        "stepId",
        "prompt",
        "correctFeedback",
        "incorrectFeedback",
        "referencedMoves",
        "referencedSquares",
        "referencedNumbers",
      ],
    },
  });

  if (prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new Error("Lesson content prompt exceeds the bounded input size.");
  }
  return prompt;
};

const validateOptions = (options: FirebaseHybridProviderOptions): void => {
  if (
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 1_000 ||
    options.timeoutMs > ON_DEVICE_INFERENCE_TIMEOUT_MS
  ) {
    throw new Error(
      `Firebase hybrid lesson timeout must be between 1000 and ${ON_DEVICE_INFERENCE_TIMEOUT_MS.toString()} ms.`,
    );
  }
  if (options.cloudModel?.trim().length === 0) {
    throw new Error("Firebase hybrid cloud model must not be empty.");
  }
  if (
    options.maxOutputTokens !== undefined &&
    (!Number.isInteger(options.maxOutputTokens) ||
      options.maxOutputTokens < 64 ||
      options.maxOutputTokens > 1024)
  ) {
    throw new Error(
      "Firebase hybrid maximum output tokens must be between 64 and 1024.",
    );
  }
};

export class FirebaseHybridLessonContentProvider implements LessonContentProvider {
  readonly #client: HybridInferenceClient;
  readonly #timeoutMs: number;
  readonly #capabilityDetector: () => Promise<OnDeviceCapability>;

  constructor(
    client: HybridInferenceClient,
    options: FirebaseHybridProviderOptions,
  ) {
    validateOptions(options);
    this.#client = client;
    this.#timeoutMs = options.timeoutMs;
    this.#capabilityDetector =
      options.capabilityDetector ?? detectOnDeviceCapability;
  }

  detectCapability(): Promise<OnDeviceCapability> {
    return this.#capabilityDetector();
  }

  initializeDeviceModel(
    onDownloadProgress?: (progress: number) => void,
  ): Promise<void> {
    return this.#client.initializeDeviceModel(onDownloadProgress);
  }

  async generate(
    request: LessonContentRequest,
    signal: AbortSignal,
  ): Promise<LessonContentProviderResult> {
    if (signal.aborted) {
      throw new DOMException(
        "Lesson content request was cancelled.",
        "AbortError",
      );
    }

    const prompt = buildPrompt(request);
    const controller = new AbortController();
    const forwardAbort = (): void => {
      controller.abort(signal.reason);
    };
    signal.addEventListener("abort", forwardAbort, { once: true });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        const error = new DOMException(
          "Lesson content request timed out.",
          "TimeoutError",
        );
        reject(error);
        controller.abort(error);
      }, this.#timeoutMs);
    });

    try {
      const result = await Promise.race([
        this.#client.generate(prompt, controller.signal),
        timeout,
      ]);
      const value: unknown = JSON.parse(result.text);
      return { value, provenance: mapProvenance(result.inferenceSource) };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal.removeEventListener("abort", forwardAbort);
    }
  }
}

export const createFirebaseHybridLessonContentProvider = (
  options: CreateFirebaseHybridProviderOptions,
): FirebaseHybridLessonContentProvider => {
  validateOptions(options);
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const cloudModel = options.cloudModel ?? DEFAULT_CLOUD_MODEL;
  const ai = getAI(options.firebaseApp, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(
    ai,
    {
      mode: InferenceMode.PREFER_ON_DEVICE,
      inCloudParams: {
        model: cloudModel,
        systemInstruction,
        generationConfig: {
          maxOutputTokens,
          responseMimeType: "application/json",
          responseSchema: lessonContentResponseSchema,
        },
      },
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
          initialPrompts: [
            {
              role: "system",
              content: [{ type: "text", value: systemInstruction }],
            },
          ],
        },
        promptOptions: {
          responseConstraint: lessonContentResponseSchema,
        },
      },
    },
    { timeout: Math.min(options.timeoutMs, CLOUD_REQUEST_TIMEOUT_MS) },
  );

  const client: HybridInferenceClient = {
    initializeDeviceModel: (onDownloadProgress) =>
      model.initializeDeviceModel(onDownloadProgress),
    generate: async (prompt, signal) => {
      const result = await model.generateContent(prompt, { signal });
      return {
        text: result.response.text(),
        inferenceSource: result.response.inferenceSource,
      };
    },
  };

  return new FirebaseHybridLessonContentProvider(client, options);
};
