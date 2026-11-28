import { gameIdeaEvidence } from "./game-evidence";
import type { MomentAttemptRecord, ProgressInput } from "./types";

export function unitHistory(
  input: ProgressInput,
  unitId: string,
): readonly {
  kind: "missed" | "spotted" | "played";
  at: string;
  source: MomentAttemptRecord["source"];
}[] {
  const moments: ReturnType<typeof unitHistory>[number][] = [];

  for (const attempt of input.attempts) {
    if (attempt.unitId !== unitId) continue;
    moments.push({
      kind: attempt.outcome === "spotted" ? "spotted" : "missed",
      at: attempt.completedAt,
      source: attempt.source,
    });
  }
  for (const evidence of gameIdeaEvidence(input.games)) {
    if (evidence.unitId !== unitId) continue;
    moments.push({
      kind: evidence.outcome,
      at: evidence.completedAt,
      source: { kind: "game", gameId: evidence.gameId, ply: evidence.ply },
    });
  }

  return moments.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
