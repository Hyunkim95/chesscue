import { describe, expect, it } from "vitest";

import { createGameId } from "./types";

import {
  applyCpuMove,
  applyPlayerMove,
  createGameState,
  restoreGameState,
  resignGame,
} from "./game-state";

describe("game state", () => {
  it("starts with the player to move as white", () => {
    const created = createGameState();
    expect(created.ok && created.value.phase).toBe("player-turn");
  });

  it("applies a legal player move and hands the turn to the CPU", () => {
    const created = createGameState();
    if (!created.ok) throw new Error("Expected a valid starting state");

    const moved = applyPlayerMove(
      created.value,
      { from: "e2", to: "e4" },
      "2026-11-24T12:00:00Z",
    );

    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.value.phase).toBe("cpu-turn");
      expect(moved.value.moves[0]).toMatchObject({
        san: "e4",
        uci: "e2e4",
        ply: 1,
      });
    }
  });

  it("rejects illegal moves without changing the position", () => {
    const created = createGameState();
    if (!created.ok) throw new Error("Expected a valid starting state");

    const moved = applyPlayerMove(
      created.value,
      { from: "e2", to: "e5" },
      "2026-11-24T12:00:00Z",
    );

    expect(moved).toEqual({
      ok: false,
      error: { code: "illegal-move", from: "e2", to: "e5" },
    });
    expect(created.value.moves).toHaveLength(0);
  });

  it("rejects a second player move before the CPU replies", () => {
    const created = createGameState();
    if (!created.ok) throw new Error("Expected a valid starting state");
    const firstMove = applyPlayerMove(
      created.value,
      { from: "e2", to: "e4" },
      "2026-11-24T12:00:00Z",
    );
    if (!firstMove.ok) throw new Error("Expected a legal first move");

    const secondMove = applyPlayerMove(
      firstMove.value,
      { from: "d2", to: "d4" },
      "2026-11-24T12:00:01Z",
    );

    expect(secondMove).toEqual({ ok: false, error: { code: "wrong-turn" } });
  });

  it("applies a legal UCI move from the CPU", () => {
    const created = createGameState();
    if (!created.ok) throw new Error("Expected a valid starting state");
    const playerMove = applyPlayerMove(
      created.value,
      { from: "e2", to: "e4" },
      "2026-11-24T12:00:00Z",
    );
    if (!playerMove.ok) throw new Error("Expected a legal player move");

    const cpuMove = applyCpuMove(
      playerMove.value,
      "e7e5",
      "2026-11-24T12:00:01Z",
    );

    expect(cpuMove.ok).toBe(true);
    if (cpuMove.ok) {
      expect(cpuMove.value.phase).toBe("player-turn");
      expect(cpuMove.value.moves[1]).toMatchObject({
        san: "e5",
        uci: "e7e5",
        ply: 2,
      });
    }
  });

  it("detects checkmate and stops the game", () => {
    const created = createGameState();
    if (!created.ok) throw new Error("Expected a valid starting state");
    const f3 = applyPlayerMove(
      created.value,
      { from: "f2", to: "f3" },
      "2026-11-24T12:00:00Z",
    );
    if (!f3.ok) throw new Error("Expected f3");
    const e5 = applyCpuMove(f3.value, "e7e5", "2026-11-24T12:00:01Z");
    if (!e5.ok) throw new Error("Expected e5");
    const g4 = applyPlayerMove(
      e5.value,
      { from: "g2", to: "g4" },
      "2026-11-24T12:00:02Z",
    );
    if (!g4.ok) throw new Error("Expected g4");

    const mate = applyCpuMove(g4.value, "d8h4", "2026-11-24T12:00:03Z");

    expect(mate.ok).toBe(true);
    if (mate.ok) {
      expect(mate.value.phase).toBe("completed");
      expect(mate.value.result).toBe("black-win");
    }
  });

  it("records resignation as a terminal loss", () => {
    const created = createGameState();
    if (!created.ok) throw new Error("Expected a valid starting state");

    const resigned = resignGame(created.value);

    expect(resigned.phase).toBe("resigned");
    expect(resigned.result).toBe("black-win");
  });

  it("restores the exact unfinished position from immutable moves", () => {
    const created = createGameState();
    if (!created.ok) throw new Error("Expected a valid starting state");
    const player = applyPlayerMove(
      created.value,
      { from: "e2", to: "e4" },
      "2026-11-24T12:00:00Z",
    );
    if (!player.ok) throw new Error("Expected e4");
    const cpu = applyCpuMove(player.value, "c7c5", "2026-11-24T12:00:01Z");
    if (!cpu.ok) throw new Error("Expected c5");

    const restored = restoreGameState({
      schemaVersion: 1,
      id: createGameId("resume-game"),
      origin: { type: "tutor" },
      initialFen: created.value.initialFen,
      moves: cpu.value.moves,
      pgn: cpu.value.pgn,
      playerColor: "white",
      result: null,
      createdAt: "2026-11-24T12:00:00Z",
      completedAt: null,
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      fingerprint: null,
    });

    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.value.fen).toBe(cpu.value.fen);
      expect(restored.value.moves).toEqual(cpu.value.moves);
      expect(restored.value.phase).toBe("player-turn");
    }
  });
});
