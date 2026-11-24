import type { EngineFailure, GameEngine } from "../ports/game-engine";
import type {
  GameRepository,
  RepositoryFailure,
} from "../ports/game-repository";
import {
  applyCpuMove,
  applyPlayerMove,
  createGameState,
  resignGame,
  type GameRuleFailure,
  type GameState,
  type MoveInput,
} from "../../domain/game/game-state";
import type {
  GameId,
  GameRecord,
  PlayerColor,
  PositionId,
} from "../../domain/game/types";
import type { Result } from "../../shared/result/result";
import { err, ok } from "../../shared/result/result";

export interface PlaySession {
  readonly state: GameState;
  readonly record: GameRecord;
}

export type PlayFailure =
  | {
      readonly code: "rule";
      readonly cause: GameRuleFailure;
      readonly session?: PlaySession;
    }
  | {
      readonly code: "storage";
      readonly cause: RepositoryFailure;
      readonly session: PlaySession;
    }
  | {
      readonly code: "engine";
      readonly cause: EngineFailure;
      readonly session: PlaySession;
    };

export interface StartTutorGameInput {
  readonly id: GameId;
  readonly playerColor: PlayerColor;
  readonly curriculumVersion: string;
  readonly configurationVersion: string;
  readonly now: string;
  readonly repository: GameRepository;
  readonly initialFen?: string;
}

export async function startTutorGame(
  input: StartTutorGameInput,
): Promise<Result<PlaySession, PlayFailure>> {
  const created = createGameState({
    playerColor: input.playerColor === "white" ? "w" : "b",
    ...(input.initialFen === undefined ? {} : { initialFen: input.initialFen }),
  });
  if (!created.ok) return err({ code: "rule", cause: created.error });

  const session: PlaySession = {
    state: created.value,
    record: {
      schemaVersion: 1,
      id: input.id,
      origin: { type: "tutor" },
      initialFen: created.value.initialFen,
      moves: [],
      pgn: created.value.pgn,
      playerColor: input.playerColor,
      result: null,
      createdAt: input.now,
      completedAt: null,
      curriculumVersion: input.curriculumVersion,
      configurationVersion: input.configurationVersion,
      fingerprint: null,
    },
  };

  const persisted = await input.repository.put(session.record);
  return persisted.ok
    ? ok(session)
    : err({ code: "storage", cause: persisted.error, session });
}

export async function acceptPlayerMove(input: {
  readonly session: PlaySession;
  readonly move: MoveInput;
  readonly now: string;
  readonly repository: GameRepository;
}): Promise<Result<PlaySession, PlayFailure>> {
  const moved = applyPlayerMove(input.session.state, input.move, input.now);
  if (!moved.ok)
    return err({ code: "rule", cause: moved.error, session: input.session });
  return persistState(
    input.session.record,
    moved.value,
    input.now,
    input.repository,
  );
}

export async function requestCpuReply(input: {
  readonly session: PlaySession;
  readonly engine: GameEngine;
  readonly repository: GameRepository;
  readonly positionId: PositionId;
  readonly targetElo: number;
  readonly timeBudgetMs: number;
  readonly now: () => string;
  readonly signal: AbortSignal;
}): Promise<Result<PlaySession, PlayFailure>> {
  const move = await input.engine.chooseMove({
    positionId: input.positionId,
    fen: input.session.state.fen,
    moves: input.session.state.moves.map(({ uci }) => uci),
    targetElo: input.targetElo,
    timeBudgetMs: input.timeBudgetMs,
    signal: input.signal,
  });
  if (!move.ok)
    return err({ code: "engine", cause: move.error, session: input.session });

  const playedAt = input.now();
  const moved = applyCpuMove(input.session.state, move.value.uci, playedAt);
  if (!moved.ok)
    return err({ code: "rule", cause: moved.error, session: input.session });
  return persistState(
    input.session.record,
    moved.value,
    playedAt,
    input.repository,
  );
}

export async function resignTutorGame(input: {
  readonly session: PlaySession;
  readonly now: string;
  readonly repository: GameRepository;
}): Promise<Result<PlaySession, PlayFailure>> {
  const resigned = resignGame(input.session.state);
  return persistState(
    input.session.record,
    resigned,
    input.now,
    input.repository,
  );
}

async function persistState(
  previous: GameRecord,
  state: GameState,
  now: string,
  repository: GameRepository,
): Promise<Result<PlaySession, PlayFailure>> {
  const terminal = state.phase === "completed" || state.phase === "resigned";
  const record: GameRecord = {
    ...previous,
    moves: state.moves,
    pgn: state.pgn,
    result: state.result,
    completedAt: terminal ? (previous.completedAt ?? now) : null,
  };
  const session = { state, record };
  const persisted = await repository.put(record);
  return persisted.ok
    ? ok(session)
    : err({ code: "storage", cause: persisted.error, session });
}
