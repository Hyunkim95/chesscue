import {
  focusOpeningCandidates,
  FOCUS_OPENING_POLICY_VERSION,
} from "../../domain/curriculum/focus-opening-policy";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  EngineMoveRequest,
  GameEngine,
} from "../../application/ports/game-engine";
import type { GameRepository } from "../../application/ports/game-repository";
import type { GameId, GameRecord, PositionId } from "../../domain/game/types";
import type { Result } from "../../shared/result/result";
import { ok } from "../../shared/result/result";
import { PlayGameScreen } from "./PlayGameScreen";

class MemoryRepository implements GameRepository {
  public readonly records: GameRecord[] = [];

  public get(): Promise<Result<GameRecord | null, never>> {
    return Promise.resolve(ok(null));
  }

  public put(record: GameRecord): Promise<Result<void, never>> {
    this.records.push(record);
    return Promise.resolve(ok(undefined));
  }

  public getLatestInProgress(): Promise<Result<GameRecord | null, never>> {
    const record = this.records.findLast(
      (item) => item.completedAt === null && item.result === null,
    );
    return Promise.resolve(ok(record ?? null));
  }

  public listCompleted(): Promise<Result<readonly GameRecord[], never>> {
    return Promise.resolve(ok([]));
  }
}

class ReadyEngine implements GameEngine {
  public disposed = false;
  public request: EngineMoveRequest | null = null;

  public initialize(): Promise<Result<void, never>> {
    return Promise.resolve(ok(undefined));
  }

  public chooseMove(
    request: EngineMoveRequest,
  ): Promise<Result<{ readonly uci: string }, never>> {
    this.request = request;
    return Promise.resolve(ok({ uci: "e7e5" }));
  }

  public dispose(): void {
    this.disposed = true;
  }
}

const gameId = (value: string): GameId => value as GameId;
const positionId = (value: string): PositionId => value as PositionId;

afterEach(() => {
  cleanup();
});

describe("PlayGameScreen", () => {
  it("lets the player move and shows the CPU reply without coaching", async () => {
    const repository = new MemoryRepository();
    const engine = new ReadyEngine();
    render(
      <PlayGameScreen
        engine={engine}
        repository={repository}
        createGameId={() => gameId("game-1")}
        createPositionId={() => positionId("position-1")}
      />,
    );
    await screen.findByText("Your move");

    fireEvent.click(screen.getByRole("gridcell", { name: "White pawn on e2" }));
    fireEvent.click(screen.getByRole("gridcell", { name: "Empty e4" }));

    await waitFor(() => {
      expect(
        screen.getByRole("gridcell", { name: "Black pawn on e5" }),
      ).toBeVisible();
    });
    const moveHistory = screen.getByRole("list", { name: "Move history" });
    expect(within(moveHistory).getByText("e4")).toBeVisible();
    expect(within(moveHistory).getByText("e5")).toBeVisible();
    expect(
      screen.queryByText(/hint|evaluation|candidate|coach/i),
    ).not.toBeInTheDocument();
    expect(repository.records.at(-1)?.moves).toHaveLength(2);
    const moves = focusOpeningCandidates({
      focus: "development",
      moves: ["e2e4"],
      fen: engine.request?.fen ?? "",
    });
    expect(engine.request?.searchMoves).toEqual(
      moves.length ? moves : undefined,
    );
    expect(repository.records.at(-1)?.origin).toEqual({
      type: "tutor",
      trainingFocus: "development",
      openingPolicyVersion: FOCUS_OPENING_POLICY_VERSION,
    });
  });

  it("preserves the terminal resignation state", async () => {
    const engine = new ReadyEngine();
    const repository = new MemoryRepository();
    const onGameCompleted = vi.fn();
    const createGameId = () => gameId("game-2");
    const createPositionId = () => positionId("position-2");
    const now = () => "2026-11-24T12:00:00Z";
    const view = render(
      <StrictMode>
        <PlayGameScreen
          engine={engine}
          repository={repository}
          createGameId={createGameId}
          createPositionId={createPositionId}
          now={now}
          onGameCompleted={onGameCompleted}
        />
      </StrictMode>,
    );
    await screen.findByText("Your move");

    fireEvent.click(screen.getByRole("button", { name: "Resign game" }));

    expect(await screen.findByText("Game resigned")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Start another game" }),
    ).toBeVisible();
    expect(onGameCompleted).toHaveBeenCalledTimes(1);
    expect(onGameCompleted.mock.calls[0]?.[0]).toMatchObject({
      id: "game-2",
      result: "black-win",
      completedAt: "2026-11-24T12:00:00Z",
    });

    view.rerender(
      <StrictMode>
        <PlayGameScreen
          engine={engine}
          repository={repository}
          createGameId={createGameId}
          createPositionId={createPositionId}
          now={now}
          onGameCompleted={onGameCompleted}
        />
      </StrictMode>,
    );
    expect(onGameCompleted).toHaveBeenCalledTimes(1);
  });

  it("keeps the saved terminal state when the completion callback throws", async () => {
    const onGameCompleted = vi.fn(() => {
      throw new Error("analysis handoff failed");
    });
    const repository = new MemoryRepository();
    render(
      <PlayGameScreen
        engine={new ReadyEngine()}
        repository={repository}
        createGameId={() => gameId("game-callback-failure")}
        createPositionId={() => positionId("position-callback-failure")}
        now={() => "2026-11-24T12:00:00Z"}
        onGameCompleted={onGameCompleted}
      />,
    );
    await screen.findByText("Your move");

    fireEvent.click(screen.getByRole("button", { name: "Resign game" }));

    expect(await screen.findByText("Game resigned")).toBeVisible();
    expect(repository.records.at(-1)).toMatchObject({
      result: "black-win",
      completedAt: "2026-11-24T12:00:00Z",
    });
    expect(onGameCompleted).toHaveBeenCalledTimes(1);
  });
});
