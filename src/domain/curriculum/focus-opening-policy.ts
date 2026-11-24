import { Chess } from "chess.js";

import type { CurriculumTheme } from "./types";

export const FOCUS_OPENING_POLICY_VERSION = "focus-openings@1";

type OpeningProfile =
  | "piece-pressure"
  | "forcing"
  | "tension"
  | "open-center"
  | "classical"
  | "sharp"
  | "simplifying";

export interface FocusOpeningPolicyEntry {
  readonly profile: OpeningProfile;
  readonly afterMoves: readonly string[];
  readonly candidateMoves: readonly string[];
}

const profileByTheme: Readonly<Record<CurriculumTheme, OpeningProfile>> = {
  "hanging-piece": "piece-pressure",
  "one-move-threat": "forcing",
  "central-pawn-tension": "tension",
  "king-safety": "open-center",
  development: "classical",
  calculation: "sharp",
  "endgame-technique": "simplifying",
  other: "classical",
};

const firstResponses = (
  profile: OpeningProfile,
  responses: Readonly<Record<string, readonly string[]>>,
): readonly FocusOpeningPolicyEntry[] =>
  Object.entries(responses).map(([firstMove, candidateMoves]) => ({
    profile,
    afterMoves: [firstMove],
    candidateMoves,
  }));

export const focusOpeningPolicyEntries: readonly FocusOpeningPolicyEntry[] = [
  ...firstResponses("piece-pressure", {
    e2e4: ["e7e5"],
    d2d4: ["g8f6"],
    c2c4: ["g8f6"],
    g1f3: ["d7d5"],
  }),
  {
    profile: "piece-pressure",
    afterMoves: ["e2e4", "e7e5", "g1f3"],
    candidateMoves: ["b8c6"],
  },
  {
    profile: "piece-pressure",
    afterMoves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"],
    candidateMoves: ["a7a6"],
  },
  {
    profile: "piece-pressure",
    afterMoves: ["d2d4", "g8f6", "c2c4"],
    candidateMoves: ["e7e6", "g7g6"],
  },
  ...firstResponses("forcing", {
    e2e4: ["e7e5"],
    d2d4: ["d7d5"],
    c2c4: ["e7e5"],
    g1f3: ["d7d5"],
  }),
  {
    profile: "forcing",
    afterMoves: ["e2e4", "e7e5", "g1f3"],
    candidateMoves: ["b8c6"],
  },
  {
    profile: "forcing",
    afterMoves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
    candidateMoves: ["g8f6"],
  },
  ...firstResponses("tension", {
    e2e4: ["c7c5"],
    d2d4: ["d7d5"],
    c2c4: ["e7e5"],
    g1f3: ["d7d5"],
  }),
  {
    profile: "tension",
    afterMoves: ["e2e4", "c7c5", "g1f3"],
    candidateMoves: ["d7d6", "b8c6", "e7e6"],
  },
  {
    profile: "tension",
    afterMoves: ["d2d4", "d7d5", "c2c4"],
    candidateMoves: ["e7e6", "c7c6"],
  },
  {
    profile: "tension",
    afterMoves: ["c2c4", "e7e5", "b1c3"],
    candidateMoves: ["g8f6"],
  },
  ...firstResponses("open-center", {
    e2e4: ["e7e5"],
    d2d4: ["d7d5"],
    c2c4: ["e7e5"],
    g1f3: ["d7d5"],
  }),
  {
    profile: "open-center",
    afterMoves: ["e2e4", "e7e5", "g1f3"],
    candidateMoves: ["b8c6", "g8f6"],
  },
  {
    profile: "open-center",
    afterMoves: ["d2d4", "d7d5", "c2c4"],
    candidateMoves: ["e7e6"],
  },
  ...firstResponses("classical", {
    e2e4: ["e7e5"],
    d2d4: ["d7d5"],
    c2c4: ["e7e5", "g8f6"],
    g1f3: ["d7d5", "g8f6"],
  }),
  {
    profile: "classical",
    afterMoves: ["e2e4", "e7e5", "g1f3"],
    candidateMoves: ["b8c6", "g8f6"],
  },
  {
    profile: "classical",
    afterMoves: ["d2d4", "d7d5", "c2c4"],
    candidateMoves: ["e7e6", "c7c6"],
  },
  ...firstResponses("sharp", {
    e2e4: ["c7c5"],
    d2d4: ["g8f6"],
    c2c4: ["e7e5"],
    g1f3: ["g8f6"],
  }),
  {
    profile: "sharp",
    afterMoves: ["e2e4", "c7c5", "g1f3"],
    candidateMoves: ["b8c6", "d7d6"],
  },
  {
    profile: "sharp",
    afterMoves: ["d2d4", "g8f6", "c2c4"],
    candidateMoves: ["e7e5", "c7c5"],
  },
  ...firstResponses("simplifying", {
    e2e4: ["e7e5"],
    d2d4: ["d7d5"],
    c2c4: ["c7c5"],
    g1f3: ["g8f6"],
  }),
  {
    profile: "simplifying",
    afterMoves: ["e2e4", "e7e5", "g1f3"],
    candidateMoves: ["g8f6"],
  },
  {
    profile: "simplifying",
    afterMoves: ["d2d4", "d7d5", "c2c4"],
    candidateMoves: ["d5c4"],
  },
] as const;

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
}): readonly string[] => {
  if (input.moves.length >= 8) return [];
  try {
    if (new Chess(input.fen).turn() !== "b") return [];
  } catch {
    return [];
  }
  const profile = profileByTheme[input.focus];
  const entry = focusOpeningPolicyEntries.find(
    (candidate) =>
      candidate.profile === profile &&
      candidate.afterMoves.length === input.moves.length &&
      candidate.afterMoves.every((move, index) => input.moves[index] === move),
  );
  return (
    entry?.candidateMoves.filter((move) => isLegalMove(input.fen, move)) ?? []
  );
};
