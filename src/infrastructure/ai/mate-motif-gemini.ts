import { Chess } from "chess.js";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
} from "firebase/ai";
import { z } from "zod";
import { initializeFirebaseClient } from "../firebase/firebase-client";

const motifs = ["back-rank", "other", "uncertain"] as const;
const responseSchema = z.object({ motif: z.enum(motifs) }).strict();

export async function classifyMateMotif(
  fen: string,
  engineMove: string,
  route: "device" | "cloud",
  signal: AbortSignal,
): Promise<(typeof motifs)[number]> {
  const position = new Chess(fen);
  const move = position.move(engineMove);
  if (!position.isCheckmate()) return "other";

  const firebase = initializeFirebaseClient({
    enableAppCheck: true,
    appCheckDebug:
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true",
  });
  if (firebase.status !== "ready") return "uncertain";
  const model = getGenerativeModel(
    getAI(firebase.services.app, { backend: new GoogleAIBackend() }),
    route === "device"
      ? {
          mode: InferenceMode.ONLY_ON_DEVICE,
          onDeviceParams: {
            createOptions: {
              expectedInputs: [{ type: "text", languages: ["en"] }],
              expectedOutputs: [{ type: "text", languages: ["en"] }],
            },
            promptOptions: {
              responseConstraint: {
                type: "object",
                properties: { motif: { type: "string", enum: [...motifs] } },
                required: ["motif"],
                additionalProperties: false,
              },
            },
          },
        }
      : {
          mode: InferenceMode.ONLY_IN_CLOUD,
          inCloudParams: {
            model: "gemini-3.5-flash-lite",
            generationConfig: { responseMimeType: "application/json" },
          },
        },
    { timeout: 10000 },
  );
  const result = await model.generateContent(
    JSON.stringify({
      task: "Classify the verified Stockfish checkmating move as back-rank mate, another mate, or uncertain. The app has already established checkmate. Inspect the resulting board. Return JSON with motif set to back-rank, other, or uncertain.",
      fen,
      move: move.san,
      resultingFen: position.fen(),
      board: position.ascii(),
    }),
    { signal },
  );
  const expected =
    route === "device" ? InferenceSource.ON_DEVICE : InferenceSource.IN_CLOUD;
  return result.response.inferenceSource === expected
    ? responseSchema.parse(JSON.parse(result.response.text())).motif
    : "uncertain";
}
