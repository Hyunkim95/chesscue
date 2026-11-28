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
    const analyzeCoachMove = vi.fn();
    render(
      <PlayGameScreen
        engine={engine}
        analyzeCoachMove={analyzeCoachMove}
        repository={repository}
        createGameId={() => gameId("game-1")}
        createPositionId={() => positionId("position-1")}
      />,
    );
    await screen.findByText("Your move");
    expect(
      screen.queryByRole("button", { name: "Next move" }),
    ).not.toBeInTheDocument();
    expect(analyzeCoachMove).not.toHaveBeenCalled();

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

  it("offers progressive hints and previews without making the coached move", async () => {
    const repository = new MemoryRepository();
    const engine = new ReadyEngine();
    const analyzeCoachMove = vi
      .fn()
      .mockResolvedValue({ line: ["e2e4"], evaluationCpFromSideToMove: 45 });
    render(
      <PlayGameScreen
        mode="coached"
        engine={engine}
        analyzeCoachMove={analyzeCoachMove}
        repository={repository}
        createGameId={() => gameId("game-hints")}
        createPositionId={() => positionId("position-hints")}
      />,
    );
    await screen.findByText("Your move");
    expect(analyzeCoachMove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Hint" }));
    await screen.findAllByRole("gridcell", { name: /Rook hint/ });
    expect(document.querySelector("[data-move-cue-arrow]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More hint" }));
    expect(
      screen.getByRole("gridcell", {
        name: /White pawn on e2.*Rook highlight/,
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
    expect(await screen.findByText(/Rook suggests e4/)).toBeVisible();
    expect(
      document.querySelector('[data-move-cue-arrow="e2:e4"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: /White pawn on e2/ }),
    ).toBeVisible();
    expect(screen.getByRole("gridcell", { name: "Empty e4" })).toBeVisible();
    expect(repository.records.at(-1)?.moves).toHaveLength(0);
    expect(engine.request).toBeNull();
    expect(analyzeCoachMove).toHaveBeenCalledTimes(1);
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

  it("starts one game on a double tap of Start another game, with a spinner while it saves", async () => {
    const repository = new MemoryRepository();
    let ids = 0;
    render(
      <PlayGameScreen
        engine={new ReadyEngine()}
        repository={repository}
        createGameId={() => gameId(`game-${String((ids += 1))}`)}
        createPositionId={() => positionId("position")}
        now={() => "2026-11-24T12:00:00Z"}
      />,
    );
    await screen.findByText("Your move");
    fireEvent.click(screen.getByRole("button", { name: "Resign game" }));
    const start = await screen.findByRole("button", {
      name: "Start another game",
    });
    // The next save waits, so the second tap lands while it runs.
    let release: () => void = () => undefined;
    const put = repository.put.bind(repository);
    vi.spyOn(repository, "put").mockImplementation(
      (record) =>
        new Promise((resolve) => {
          release = () => {
            resolve(put(record));
          };
        }),
    );
    fireEvent.click(start);
    expect(start).toHaveAttribute("aria-busy", "true");
    fireEvent.click(start);
    release();
    await screen.findByText("Your move");
    expect(new Set(repository.records.map(({ id }) => id)).size).toBe(2);
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
