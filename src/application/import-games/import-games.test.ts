import { describe, expect, it } from "vitest";

import type { GameId } from "../../domain/game/types";
import { importGames } from "./import-games";

const GAME = `[Event "Practice"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

function gameIdFactory(): () => GameId {
  let id = 0;
  return () => `imported-${String(++id)}` as GameId;
}

describe("importGames", () => {
  it("creates an immutable imported record with provenance", () => {
    const result = importGames({
      text: GAME,
      source: { type: "upload", fileName: "practice.pgn" },
      playerColor: "white",
      existingFingerprints: new Set(),
      idFactory: gameIdFactory(),
      now: () => "2026-11-24T12:00:00.000Z",
      curriculumVersion: "curriculum-1",
      configurationVersion: "config-1",
    });

    expect(result).toMatchObject({
      acceptedCount: 1,
      duplicateCount: 0,
      rejectedCount: 0,
    });
    const item = result.items[0];
    expect(item?.status).toBe("accepted");
    if (item?.status !== "accepted") return;
    expect(item.game.record).toMatchObject({
      origin: { type: "pgn-upload", sourceName: "practice.pgn" },
      result: "white-win",
      completedAt: "2026-11-24T12:00:00.000Z",
      playerColor: "white",
    });
    expect(item.game.headers.Event).toBe("Practice");
  });

  it("deduplicates against existing and same-batch fingerprints", () => {
    const initial = importGames({
      text: GAME,
      source: { type: "paste" },
      playerColor: "white",
      existingFingerprints: new Set(),
      idFactory: gameIdFactory(),
      now: () => "2026-11-24T12:00:00.000Z",
      curriculumVersion: "curriculum-1",
      configurationVersion: "config-1",
    });
    const first = initial.items[0];
    if (
      first?.status !== "accepted" ||
      first.game.record.fingerprint === null
    ) {
      throw new Error("Fixture import did not produce a fingerprint");
    }

    const existing = importGames({
      text: GAME,
      source: { type: "paste" },
      playerColor: "white",
      existingFingerprints: new Set([first.game.record.fingerprint]),
      idFactory: gameIdFactory(),
      now: () => "2026-11-24T12:00:00.000Z",
      curriculumVersion: "curriculum-1",
      configurationVersion: "config-1",
    });
    const withinBatch = importGames({
      text: `${GAME}\n\n${GAME}`,
      source: { type: "paste" },
      playerColor: "white",
      existingFingerprints: new Set(),
      idFactory: gameIdFactory(),
      now: () => "2026-11-24T12:00:00.000Z",
      curriculumVersion: "curriculum-1",
      configurationVersion: "config-1",
    });

    expect(existing.duplicateCount).toBe(1);
    expect(withinBatch).toMatchObject({ acceptedCount: 1, duplicateCount: 1 });
  });

  it("preserves Black as the learner color on every accepted game", () => {
    const result = importGames({
      text: GAME,
      source: { type: "paste" },
      playerColor: "black",
      existingFingerprints: new Set(),
      idFactory: gameIdFactory(),
      now: () => "2026-11-24T12:00:00.000Z",
      curriculumVersion: "curriculum-1",
      configurationVersion: "config-1",
    });

    const accepted = result.items.filter((item) => item.status === "accepted");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.game.record.playerColor).toBe("black");
  });
});
