import type { MomentAttemptRecord } from "../../domain/progress/types";
import type { MomentResult } from "../../domain/session/types";

// The immutable record of one completed position.
export function momentRecord({
  id,
  result,
  source,
  unitId,
  completedAt,
}: {
  readonly id: string;
  readonly result: MomentResult;
  readonly source: MomentAttemptRecord["source"];
  readonly unitId: string | undefined;
  readonly completedAt: Date;
}): MomentAttemptRecord | undefined {
  const [first] = result.attempts;
  // Show me before any try leaves no first move: recorded as "".
  if (!first && result.outcome !== "shown") return undefined;
  return {
    schemaVersion: 1,
    id,
    source,
    ...(unitId === undefined ? {} : { unitId }),
    firstMoveUci: first?.uci ?? "",
    tiers: result.attempts.map(({ tier }) => tier),
    outcome: result.outcome,
    helped: result.helped,
    explorations: result.explorations,
    completedAt: completedAt.toISOString(),
  };
}
