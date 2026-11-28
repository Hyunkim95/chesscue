import type { QuestionOutcome } from "./route-question";
import { routeQuestion } from "./route-question";

type Question = Omit<Parameters<typeof routeQuestion>[0], "online" | "cloud">;

// Gemini Nano reads the question first, on the device; Rook confirms what
// it understood. Gemini Flash, on the player's own key, is asked only when
// Nano is missing or has no answer (owner decision, 28 November 2026: use
// Flash only for what Nano cannot do).
export async function routeNanoFirst({
  online,
  cloud,
  ...question
}: Question & {
  readonly online: boolean;
  readonly cloud: Parameters<typeof routeQuestion>[0]["cloud"];
}): Promise<QuestionOutcome> {
  if (question.device) {
    const read = await routeQuestion({
      ...question,
      online: false,
      cloud: undefined,
    });
    if (read.kind !== "unrouted" || question.signal.aborted) return read;
  }
  if (!online || !cloud) return { kind: "unrouted" };
  return routeQuestion({ ...question, online, cloud, device: undefined });
}
