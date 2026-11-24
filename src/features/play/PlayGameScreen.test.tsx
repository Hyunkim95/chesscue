import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
    render(
      <PlayGameScreen
        engine={new ReadyEngine()}
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
  });

  it("preserves the terminal resignation state", async () => {
    render(
      <PlayGameScreen
        engine={new ReadyEngine()}
        repository={new MemoryRepository()}
        createGameId={() => gameId("game-2")}
        createPositionId={() => positionId("position-2")}
        now={() => "2026-11-24T12:00:00Z"}
      />,
    );
    await screen.findByText("Your move");

    fireEvent.click(screen.getByRole("button", { name: "Resign game" }));

    expect(await screen.findByText("Game resigned")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Start another game" }),
    ).toBeVisible();
  });
});
