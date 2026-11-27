import type { GameRecord, PlayerColor } from "../../domain/game/types";

export type ResultOutcome = "won" | "lost" | "draw";

export interface FinalPosition {
  readonly fen: string;
  readonly lastMoveUci: string | undefined;
  readonly orientation: PlayerColor;
  readonly outcome: ResultOutcome;
}

// The board after the last move, from the player's side, and the result.
export function finalPosition(game: GameRecord): FinalPosition {
  const last = game.moves.at(-1);
  const orientation = game.playerColor ?? "white";
  return {
    fen: last?.fenAfter ?? game.initialFen,
    lastMoveUci: last?.uci,
    orientation,
    outcome:
      game.result === "draw"
        ? "draw"
        : game.result === `${orientation}-win`
          ? "won"
          : "lost",
  };
}
