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
import { playerGemini } from "./player-gemini";

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

  const input = JSON.stringify({
    task: "Classify the verified Stockfish checkmating move as back-rank mate, another mate, or uncertain. The app has already established checkmate. Inspect the resulting board. Return JSON with motif set to back-rank, other, or uncertain.",
    fen,
    move: move.san,
    resultingFen: position.fen(),
    board: position.ascii(),
  });
  const constraint = {
    type: "object",
    properties: { motif: { type: "string", enum: [...motifs] } },
    required: ["motif"],
    additionalProperties: false,
  };
  const text =
    route === "cloud"
      ? // Cloud runs on the player's own key: none means no label.
        await playerGemini({
          model: "gemini-3.5-flash-lite",
          system: "Return only JSON.",
          schema: constraint,
          timeoutMs: 10_000,
        })?.generate(input, signal)
      : await onDevice(input, constraint, signal);
  if (text === undefined) return "uncertain";
  const checked = responseSchema.safeParse(JSON.parse(text));
  return checked.success ? checked.data.motif : "uncertain";
}

async function onDevice(
  input: string,
  constraint: Readonly<Record<string, unknown>>,
  signal: AbortSignal,
): Promise<string | undefined> {
  const firebase = initializeFirebaseClient({
    enableAppCheck: true,
    appCheckDebug:
      import.meta.env.DEV &&
      import.meta.env.VITE_FIREBASE_APP_CHECK_DEBUG === "true",
  });
  if (firebase.status !== "ready") return undefined;
  const model = getGenerativeModel(
    getAI(firebase.services.app, { backend: new GoogleAIBackend() }),
    {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
        },
        promptOptions: { responseConstraint: constraint },
      },
    },
    { timeout: 10000 },
  );
  const result = await model.generateContent(input, { signal });
  return result.response.inferenceSource === InferenceSource.ON_DEVICE
    ? result.response.text()
    : undefined;
}
