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
    existing.origin.type !== incoming.origin.type ||
    (existing.origin.type === "tutor" &&
      incoming.origin.type === "tutor" &&
      (existing.origin.mode !== incoming.origin.mode ||
        existing.origin.opponentElo !== incoming.origin.opponentElo ||
        existing.origin.beginnerOpponent?.target !==
          incoming.origin.beginnerOpponent?.target ||
        existing.origin.coachNotesAtStart !==
          incoming.origin.coachNotesAtStart ||
        existing.origin.trainingFocus !== incoming.origin.trainingFocus ||
        existing.origin.openingPolicyVersion !==
          incoming.origin.openingPolicyVersion))
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

  if (existing.coachJoinedAtPly !== incoming.coachJoinedAtPly) {
    const canJoin =
      existing.coachJoinedAtPly === undefined &&
      existing.origin.type === "tutor" &&
      existing.origin.mode === "rated" &&
      incoming.coachJoinedAtPly === existing.moves.length &&
      incoming.moves.length === existing.moves.length &&
      incoming.completedAt === null &&
      incoming.result === null;
    if (!canJoin)
      return {
        type: "conflict",
        reason:
          "Coach can only join once, at the current move in an unfinished rated game.",
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
