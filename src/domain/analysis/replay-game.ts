import { Chess } from "chess.js";

import { collectCapture, type BoardCapture } from "../game/board-balance";
import type { GameRecord } from "../game/types";

export const MAX_GUIDED_PLIES = 4;

export interface ReplayFrame {
  readonly ply: number;
  readonly fen: string;
  readonly lastMoveUci: string | null;
  readonly lastMoveSan: string | null;
  readonly captures: readonly BoardCapture[];
}

export type ReplayBuildResult =
  | { readonly ok: true; readonly frames: readonly ReplayFrame[] }
  | { readonly ok: false; readonly message: string };

export function buildGameReplay(game: GameRecord): ReplayBuildResult {
  let chess: Chess;
  try {
    chess = new Chess(game.initialFen);
  } catch {
    return { ok: false, message: "The saved initial position is invalid." };
  }

  let captures: readonly BoardCapture[] = [];
  const frames: ReplayFrame[] = [
    {
      ply: 0,
      fen: chess.fen(),
      lastMoveUci: null,
      lastMoveSan: null,
      captures,
    },
  ];
  for (const recordedMove of game.moves) {
    try {
      const move = chess.move({
        from: recordedMove.uci.slice(0, 2),
        to: recordedMove.uci.slice(2, 4),
        ...(recordedMove.uci.length === 5
          ? { promotion: recordedMove.uci.slice(4, 5) }
          : {}),
      });
      if (move.after !== recordedMove.fenAfter) {
        return {
          ok: false,
          message: `Move ${String(recordedMove.ply)} does not match its saved position.`,
        };
      }
      captures = collectCapture(captures, move);
      frames.push({
        ply: recordedMove.ply,
        fen: move.after,
        lastMoveUci: recordedMove.uci,
        lastMoveSan: move.san,
        captures,
      });
    } catch {
      return {
        ok: false,
        message: `Move ${String(recordedMove.ply)} is illegal in the saved game.`,
      };
    }
  }
  return { ok: true, frames };
}

export function buildVariationFrames(
  initialFen: string,
  moves: readonly string[],
  initialCaptures: readonly BoardCapture[] = [],
): ReplayBuildResult {
  let chess: Chess;
  try {
    chess = new Chess(initialFen);
  } catch {
    return { ok: false, message: "The selected review position is invalid." };
  }

  let captures = initialCaptures;
  const frames: ReplayFrame[] = [
    {
      ply: 0,
      fen: chess.fen(),
      lastMoveUci: null,
      lastMoveSan: null,
      captures,
    },
  ];
  for (const [index, uci] of moves.entries()) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
      });
      captures = collectCapture(captures, move);
      frames.push({
        ply: index + 1,
        fen: move.after,
        lastMoveUci: uci,
        lastMoveSan: move.san,
        captures,
      });
    } catch {
      return {
        ok: false,
        message: `The verified line became illegal at step ${String(index + 1)}.`,
      };
    }
  }
  return { ok: true, frames };
}
