import { Chess } from "chess.js";

import type { StoryFrame } from "./line-storyboard";
import type { PositionPacket } from "./position-packet";
import type { WhyPacket } from "./why-packet";

// Everything Rook already knows when the player asks, for a writer to
// explain in its own words (owner decision, 28 November 2026: plumb the
// context to Flash). The board's own storyboard is included, so the answer
// matches what the player sees; the validator checks the answer against all
// of it.

export interface BoardStep {
  readonly move: string;
  readonly by: "you" | "me";
  readonly caption: string;
}

// The storyboard the board plays, with each move in notation.
export function boardShows(
  fen: string,
  frames: readonly StoryFrame[],
): readonly BoardStep[] {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return [];
  }
  const steps: BoardStep[] = [];
  for (const frame of frames) {
    try {
      const move = board.move({
        from: frame.moveUci.slice(0, 2),
        to: frame.moveUci.slice(2, 4),
        ...(frame.moveUci.length > 4
          ? { promotion: frame.moveUci.slice(4) }
          : {}),
      });
      steps.push({
        move: move.san,
        by: frame.by === "learner" ? "you" : "me",
        caption: frame.caption,
      });
    } catch {
      break;
    }
  }
  return steps;
}

export interface OpenContext {
  readonly question: string;
  readonly facts: PositionPacket;
  // Once solved: why the best move works, from its own searches.
  readonly whyItWorks: WhyPacket | null;
  readonly theBoardShows: readonly BoardStep[];
}
