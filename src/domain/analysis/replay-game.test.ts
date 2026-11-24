import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import {
  createGameId,
  type GameRecord,
  type RecordedMove,
} from "../game/types";
import { buildGameReplay, buildVariationFrames } from "./replay-game";

function fixtureGame(): GameRecord {
  const chess = new Chess();
  const moves: RecordedMove[] = [];
  for (const [index, uci] of ["e2e4", "e7e5", "g1f3"].entries()) {
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    moves.push({
      ply: index + 1,
      san: move.san,
      uci,
      fenAfter: move.after,
      playedAt: "2026-11-24T12:00:00.000Z",
    });
  }
  return {
    schemaVersion: 1,
    id: createGameId("replay-game"),
    origin: { type: "tutor" },
    initialFen: new Chess().fen(),
    moves,
    pgn: chess.pgn(),
    playerColor: "white",
    result: "white-win",
    createdAt: "2026-11-24T12:00:00.000Z",
    completedAt: "2026-11-24T12:10:00.000Z",
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    fingerprint: null,
  };
}

describe("review replay builders", () => {
  it("replays every stored position from the initial board", () => {
    const result = buildGameReplay(fixtureGame());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frames).toHaveLength(4);
    expect(result.frames[2]).toMatchObject({
      ply: 2,
      lastMoveUci: "e7e5",
      lastMoveSan: "e5",
    });
  });

  it("builds a verified variation from the selected position", () => {
    const result = buildVariationFrames(new Chess().fen(), [
      "e2e4",
      "e7e5",
      "g1f3",
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frames.map((frame) => frame.lastMoveSan)).toEqual([
      null,
      "e4",
      "e5",
      "Nf3",
    ]);
  });

  it("rejects an illegal variation step without guessing", () => {
    const result = buildVariationFrames(new Chess().fen(), ["e2e5"]);

    expect(result).toMatchObject({ ok: false, message: /illegal/ });
  });
});
