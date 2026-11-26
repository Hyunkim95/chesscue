import { starterPack } from "../material/pack";
import { Chess } from "chess.js";

import type { CurriculumTheme } from "./types";

export const FOCUS_OPENING_POLICY_VERSION =
  "generated-openings@" + starterPack.runId;

export const focusOpeningPolicyEntries = starterPack.openings;
const isLegalMove = (fen: string, uci: string): boolean => {
  try {
    const game = new Chess(fen);
    game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
    });
    return true;
  } catch {
    return false;
  }
};

export const focusOpeningCandidates = (input: {
  readonly focus: CurriculumTheme;
  readonly fen: string;
  readonly moves: readonly string[];
  readonly policyVersion?: string;
}): readonly string[] => {
  if (
    input.policyVersion &&
    input.policyVersion !== FOCUS_OPENING_POLICY_VERSION
  )
    return [];
  if (input.moves.length >= 8) return [];
  try {
    if (new Chess(input.fen).turn() !== "b") return [];
  } catch {
    return [];
  }
  const theme =
    input.focus === "central-pawn-tension"
      ? "premature-central-exchange"
      : input.focus;
  const entry = focusOpeningPolicyEntries.find(
    (candidate) =>
      candidate.theme === theme &&
      candidate.afterMoves.length === input.moves.length &&
      candidate.afterMoves.every((move, index) => input.moves[index] === move),
  );
  return (
    entry?.candidateMoves.filter((move) => isLegalMove(input.fen, move)) ?? []
  );
};
