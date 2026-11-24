import { Chess, type Color, type Square } from "chess.js";

import type { Result } from "../../shared/result/result";
import { err, ok } from "../../shared/result/result";
import type { GameResult, RecordedMove } from "./types";

export type GamePhase = "player-turn" | "cpu-turn" | "completed" | "resigned";

export interface GameState {
  readonly initialFen: string;
  readonly fen: string;
  readonly pgn: string;
  readonly moves: readonly RecordedMove[];
  readonly playerColor: Color;
  readonly phase: GamePhase;
  readonly result: GameResult | null;
}

export interface MoveInput {
  readonly from: Square;
  readonly to: Square;
  readonly promotion?: "q" | "r" | "b" | "n";
}

export type GameRuleFailure =
  | { readonly code: "game-over" }
  | { readonly code: "wrong-turn" }
  | {
      readonly code: "illegal-move";
      readonly from: string;
      readonly to: string;
    }
  | { readonly code: "invalid-position"; readonly message: string };

const DEFAULT_POSITION = new Chess().fen();

export function createGameState(
  options: {
    readonly playerColor?: Color;
    readonly initialFen?: string;
  } = {},
): Result<GameState, GameRuleFailure> {
  const playerColor = options.playerColor ?? "w";
  const initialFen = options.initialFen ?? DEFAULT_POSITION;

  try {
    const game = new Chess(initialFen);
    return ok({
      initialFen,
      fen: game.fen(),
      pgn: game.pgn(),
      moves: [],
      playerColor,
      phase: game.turn() === playerColor ? "player-turn" : "cpu-turn",
      result: null,
    });
  } catch (cause: unknown) {
    return err({
      code: "invalid-position",
      message:
        cause instanceof Error
          ? cause.message
          : "The initial position is invalid",
    });
  }
}

export function applyPlayerMove(
  state: GameState,
  move: MoveInput,
  playedAt: string,
): Result<GameState, GameRuleFailure> {
  if (state.phase === "completed" || state.phase === "resigned")
    return err({ code: "game-over" });
  if (state.phase !== "player-turn") return err({ code: "wrong-turn" });
  return applyMove(state, move, playedAt);
}

export function applyCpuMove(
  state: GameState,
  uci: string,
  playedAt: string,
): Result<GameState, GameRuleFailure> {
  if (state.phase === "completed" || state.phase === "resigned")
    return err({ code: "game-over" });
  if (state.phase !== "cpu-turn") return err({ code: "wrong-turn" });

  const parsed = parseUciMove(uci);
  return parsed.ok ? applyMove(state, parsed.value, playedAt) : parsed;
}

export function resignGame(state: GameState): GameState {
  if (state.phase === "completed" || state.phase === "resigned") return state;
  return {
    ...state,
    phase: "resigned",
    result: state.playerColor === "w" ? "black-win" : "white-win",
  };
}

function applyMove(
  state: GameState,
  input: MoveInput,
  playedAt: string,
): Result<GameState, GameRuleFailure> {
  const game = new Chess(state.fen);
  let applied: ReturnType<Chess["move"]>;

  try {
    applied = game.move(input);
  } catch {
    return err({ code: "illegal-move", from: input.from, to: input.to });
  }

  const recordedMove: RecordedMove = {
    ply: state.moves.length + 1,
    san: applied.san,
    uci: `${applied.from}${applied.to}${applied.promotion ?? ""}`,
    fenAfter: game.fen(),
    playedAt,
  };
  const result = resultFor(game);

  return ok({
    ...state,
    fen: game.fen(),
    pgn: game.pgn(),
    moves: [...state.moves, recordedMove],
    phase:
      result === null
        ? game.turn() === state.playerColor
          ? "player-turn"
          : "cpu-turn"
        : "completed",
    result,
  });
}

function resultFor(game: Chess): GameResult | null {
  if (game.isCheckmate())
    return game.turn() === "w" ? "black-win" : "white-win";
  if (game.isGameOver()) return "draw";
  return null;
}

function parseUciMove(uci: string): Result<MoveInput, GameRuleFailure> {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  const from = match?.[1];
  const to = match?.[2];
  const promotion = match?.[3];
  if (
    from === undefined ||
    to === undefined ||
    !isSquare(from) ||
    !isSquare(to)
  ) {
    return err({ code: "illegal-move", from: uci, to: "" });
  }
  if (promotion !== undefined && !isPromotion(promotion)) {
    return err({ code: "illegal-move", from, to });
  }

  return ok({
    from,
    to,
    ...(promotion === undefined ? {} : { promotion }),
  });
}

function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

function isPromotion(
  value: string,
): value is NonNullable<MoveInput["promotion"]> {
  return value === "q" || value === "r" || value === "b" || value === "n";
}
