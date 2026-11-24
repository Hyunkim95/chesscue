import type { GameRecord } from "../../domain/game/types";

import { serializeGameRecord } from "./game-record-validation";

export type WriteDecision =
  | { readonly type: "insert" }
  | { readonly type: "replace-in-progress" }
  | { readonly type: "idempotent" }
  | { readonly type: "conflict"; readonly reason: string };

export const decideGameWrite = (
  existing: GameRecord | undefined,
  incoming: GameRecord,
): WriteDecision => {
  if (existing === undefined) {
    return { type: "insert" };
  }

  if (serializeGameRecord(existing) === serializeGameRecord(incoming)) {
    return { type: "idempotent" };
  }

  if (existing.completedAt !== null) {
    return {
      type: "conflict",
      reason: "Completed games are immutable and cannot be replaced.",
    };
  }

  if (
    existing.createdAt !== incoming.createdAt ||
    existing.origin.type !== incoming.origin.type
  ) {
    return {
      type: "conflict",
      reason: "An in-progress update must preserve game identity and origin.",
    };
  }

  if (incoming.moves.length < existing.moves.length) {
    return {
      type: "conflict",
      reason: "An in-progress update cannot remove persisted moves.",
    };
  }

  for (const [index, move] of existing.moves.entries()) {
    const nextMove = incoming.moves[index];
    if (
      nextMove?.ply !== move.ply ||
      nextMove.san !== move.san ||
      nextMove.uci !== move.uci ||
      nextMove.fenAfter !== move.fenAfter
    ) {
      return {
        type: "conflict",
        reason: "An in-progress update cannot rewrite persisted move history.",
      };
    }
  }

  return { type: "replace-in-progress" };
};
