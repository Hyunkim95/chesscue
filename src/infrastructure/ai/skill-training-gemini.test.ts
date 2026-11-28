import type * as FirebaseAI from "firebase/ai";
import { beforeEach, expect, it, vi } from "vitest";

import type { VerifiedGameDrill } from "../../domain/curriculum/game-drill";
import { transferExercisesForTheme } from "../../domain/transfer";
import { draftCloudFollowUp, draftOfflineCue } from "./skill-training-gemini";

const { generate, model, cloud, cloudGenerate } = vi.hoisted(() => ({
  generate: vi.fn(),
  model: vi.fn(),
  cloud: vi.fn(),
  cloudGenerate: vi.fn(),
}));
vi.mock("./player-gemini", () => ({ playerGemini: cloud }));
vi.mock("../firebase/firebase-client", () => ({
  initializeFirebaseClient: () => ({ status: "ready", services: { app: {} } }),
}));
vi.mock("firebase/ai", async (load) => ({
  ...(await load<typeof FirebaseAI>()),
  getAI: () => ({}),
  getGenerativeModel: model,
}));

const followUps = transferExercisesForTheme("one-move-threat");
const exercise = followUps[0];
if (!exercise) throw new Error("Missing checked fixture");
const drill: VerifiedGameDrill = {
  exercise: followUps[1] ?? exercise,
  followUps,
  moveLabel: "Move 5",
  played: "d4",
  candidate: "O-O",
  phase: "opening",
  completedAt: "2026-11-24T12:00:00Z",
  imported: false,
  backRank: false,
};
const signal = new AbortController().signal;

vi.mock("./study-gemini", () => ({ createStudyAI: () => null }));
beforeEach(() => {
  vi.resetAllMocks();
  model.mockReturnValue({ generateContent: generate });
  cloud.mockReturnValue({ generate: cloudGenerate });
});

function answer(inferenceSource: string, content: unknown) {
  generate.mockResolvedValue({
    response: { inferenceSource, text: () => JSON.stringify(content) },
  });
}

it("accepts a new on-device reflection and checks inference provenance", async () => {
  answer("on_device", { question: "Which reply did you consider?" });
  await expect(draftOfflineCue(drill, signal)).resolves.toMatchObject({
    question: "Which reply did you consider?",
    authorship: { route: "on-device" },
  });
  expect(model.mock.calls[0]?.[1]).toMatchObject({ mode: "only_on_device" });
  answer("in_cloud", { question: "Which reply did you consider?" });
  await expect(draftOfflineCue(drill, signal)).rejects.toThrow(
    /On-device inference/,
  );
  answer("on_device", { question: "The rook wins a queen" });
  await expect(draftOfflineCue(drill, signal)).rejects.toThrow();
});

it("accepts only a checked follow-up from cloud and omits raw game data", async () => {
  cloudGenerate.mockResolvedValueOnce(
    JSON.stringify({
      followUpId: exercise.id,
      question: "What were you considering here?",
    }),
  );
  await expect(draftCloudFollowUp(drill, 3, signal)).resolves.toMatchObject({
    exercise: { fen: exercise.fen, authorship: { route: "cloud" } },
    question: "What were you considering here?",
  });
  expect(cloud.mock.calls[0]?.[0]).toMatchObject({
    model: "gemini-3.5-flash-lite",
  });
  expect(cloudGenerate).toHaveBeenCalledWith(
    expect.not.stringContaining(drill.exercise.fen),
    signal,
  );
  cloudGenerate.mockResolvedValueOnce(
    JSON.stringify({
      followUpId: "invented-position",
      question: "Which option did you consider?",
    }),
  );
  await expect(draftCloudFollowUp(drill, 3, signal)).rejects.toThrow(
    /Unverified/,
  );
});

it("drafts no cloud follow-up without the player's own key", async () => {
  cloud.mockReturnValue(undefined);
  await expect(draftCloudFollowUp(drill, 3, signal)).rejects.toThrow(
    /Gemini key/,
  );
});
