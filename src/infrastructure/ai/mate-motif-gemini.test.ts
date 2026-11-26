import { beforeEach, expect, it, vi } from "vitest";
import type * as FirebaseAI from "firebase/ai";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("../firebase/firebase-client", () => ({
  initializeFirebaseClient: () => ({ status: "ready", services: { app: {} } }),
}));
vi.mock("firebase/ai", async (load) => ({
  ...(await load<typeof FirebaseAI>()),
  getAI: () => ({}),
  getGenerativeModel: () => ({ generateContent: generate }),
}));

import { classifyMateMotif } from "./mate-motif-gemini";

const fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
const signal = new AbortController().signal;
beforeEach(() => generate.mockReset());

it("uses the model label for a checked mate on the same board", async () => {
  for (const motif of ["back-rank", "other"]) {
    generate.mockResolvedValueOnce({
      response: {
        inferenceSource: "on_device",
        text: () => JSON.stringify({ motif }),
      },
    });
    await expect(
      classifyMateMotif(fen, "e1e8", "device", signal),
    ).resolves.toBe(motif);
  }
});

it("does not classify a move as a motif when it fails the checkmate test", async () => {
  await expect(classifyMateMotif(fen, "e1e2", "device", signal)).resolves.toBe(
    "other",
  );
  expect(generate).not.toHaveBeenCalled();
});

it("declines a label returned from an unexpected inference route", async () => {
  generate.mockResolvedValueOnce({
    response: {
      inferenceSource: "in_cloud",
      text: () => JSON.stringify({ motif: "back-rank" }),
    },
  });
  await expect(classifyMateMotif(fen, "e1e8", "device", signal)).resolves.toBe(
    "uncertain",
  );
});
