import { afterEach, describe, expect, it, vi } from "vitest";

import { hangingPieceFacts } from "../../domain/lessons/lesson-test-fixtures";
import { hangingPiecePlaybook } from "../../domain/lessons/hanging-piece";
import type { LessonContentRequest } from "../../domain/coaching/types";

import {
  FirebaseHybridLessonContentProvider,
  type HybridInferenceClient,
} from "./firebase-hybrid-lesson-content-provider";

const firstStep = hangingPiecePlaybook.steps[0];
if (firstStep === undefined)
  throw new Error("Hanging-piece playbook requires a first step.");

const request: LessonContentRequest = {
  playbookId: hangingPiecePlaybook.id,
  playbookVersion: hangingPiecePlaybook.version,
  step: firstStep,
  facts: hangingPieceFacts,
};

const validContent = {
  stepId: firstStep.id,
  prompt: "Which piece is loose on b5?",
  correctFeedback: "Correct.",
  incorrectFeedback: "Check b5 again.",
  referencedMoves: [],
  referencedSquares: ["b5"],
  referencedNumbers: [],
};

const clientReturning = (
  inferenceSource: "on_device" | "in_cloud" | undefined,
): HybridInferenceClient => ({
  initializeDeviceModel: () => Promise.resolve(),
  generate: () =>
    Promise.resolve({ text: JSON.stringify(validContent), inferenceSource }),
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Firebase hybrid lesson content provider", () => {
  it("reports on-device provenance from the Firebase response", async () => {
    const provider = new FirebaseHybridLessonContentProvider(
      clientReturning("on_device"),
      {
        timeoutMs: 1000,
      },
    );

    await expect(
      provider.generate(request, new AbortController().signal),
    ).resolves.toEqual({
      value: validContent,
      provenance: "on-device",
    });
  });

  it("reports cloud provenance when Firebase performs its automatic fallback", async () => {
    const provider = new FirebaseHybridLessonContentProvider(
      clientReturning("in_cloud"),
      {
        timeoutMs: 1000,
      },
    );

    await expect(
      provider.generate(request, new AbortController().signal),
    ).resolves.toEqual({
      value: validContent,
      provenance: "cloud",
    });
  });

  it("rejects responses without truthful inference provenance", async () => {
    const provider = new FirebaseHybridLessonContentProvider(
      clientReturning(undefined),
      {
        timeoutMs: 1000,
      },
    );

    await expect(
      provider.generate(request, new AbortController().signal),
    ).rejects.toThrow("did not report an inference source");
  });

  it("rejects malformed JSON so the application can choose deterministic content", async () => {
    const client: HybridInferenceClient = {
      initializeDeviceModel: () => Promise.resolve(),
      generate: () =>
        Promise.resolve({ text: "{not-json", inferenceSource: "on_device" }),
    };
    const provider = new FirebaseHybridLessonContentProvider(client, {
      timeoutMs: 1000,
    });

    await expect(
      provider.generate(request, new AbortController().signal),
    ).rejects.toThrow();
  });

  it("bounds inference with an aborting timeout", async () => {
    vi.useFakeTimers();
    const client: HybridInferenceClient = {
      initializeDeviceModel: () => Promise.resolve(),
      generate: (_prompt, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              const reason: unknown = signal.reason;
              reject(
                reason instanceof Error
                  ? reason
                  : new Error("Request aborted."),
              );
            },
            { once: true },
          );
        }),
    };
    const provider = new FirebaseHybridLessonContentProvider(client, {
      timeoutMs: 1000,
    });
    const pending = provider.generate(request, new AbortController().signal);
    const rejection = expect(pending).rejects.toMatchObject({
      name: "TimeoutError",
    });

    await vi.advanceTimersByTimeAsync(1000);
    await rejection;
  });

  it("forwards caller cancellation before inference starts", async () => {
    const provider = new FirebaseHybridLessonContentProvider(
      clientReturning("on_device"),
      {
        timeoutMs: 1000,
      },
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.generate(request, controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("exposes user-activated model initialization and download progress", async () => {
    const progress = vi.fn();
    const initializeDeviceModel = vi.fn().mockResolvedValue(undefined);
    const sourceClient = clientReturning("on_device");
    const provider = new FirebaseHybridLessonContentProvider(
      {
        initializeDeviceModel,
        generate: (prompt, signal) => sourceClient.generate(prompt, signal),
      },
      { timeoutMs: 1000 },
    );

    await provider.initializeDeviceModel(progress);
    expect(initializeDeviceModel).toHaveBeenCalledWith(progress);
  });

  it("exposes capability status independently from request routing", async () => {
    const provider = new FirebaseHybridLessonContentProvider(
      clientReturning("in_cloud"),
      {
        timeoutMs: 1000,
        capabilityDetector: () => Promise.resolve({ status: "downloadable" }),
      },
    );

    await expect(provider.detectCapability()).resolves.toEqual({
      status: "downloadable",
    });
  });

  it("sends only the bounded lesson packet", async () => {
    let capturedPrompt = "";
    const client: HybridInferenceClient = {
      initializeDeviceModel: () => Promise.resolve(),
      generate: (prompt) => {
        capturedPrompt = prompt;
        return Promise.resolve({
          text: JSON.stringify(validContent),
          inferenceSource: "on_device",
        });
      },
    };
    const provider = new FirebaseHybridLessonContentProvider(client, {
      timeoutMs: 1000,
    });

    await provider.generate(request, new AbortController().signal);
    expect(capturedPrompt).toContain(hangingPieceFacts.fen);
    expect(capturedPrompt).toContain(hangingPieceFacts.threatenedMove);
    expect(capturedPrompt).not.toContain(hangingPieceFacts.sourceGameIds[0]);
  });

  it("rejects unbounded timeout configuration", () => {
    expect(
      () =>
        new FirebaseHybridLessonContentProvider(clientReturning("on_device"), {
          timeoutMs: 0,
        }),
    ).toThrow("between 1000 and 20000 ms");
  });
});
