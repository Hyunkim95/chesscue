import { describe, expect, it } from "vitest";

import { isGameRecord } from "./game-record-validation";

describe("persisted game validation", () => {
  it("rejects records with unsupported schema versions", () => {
    expect(
      isGameRecord({
        schemaVersion: 2,
        id: "game-1",
      }),
    ).toBe(false);
  });

  it("rejects uploaded origins without a source name", () => {
    expect(
      isGameRecord({
        schemaVersion: 1,
        id: "game-1",
        origin: { type: "pgn-upload", sourceName: "" },
        initialFen: "start",
        moves: [],
        pgn: "",
        playerColor: null,
        result: null,
        createdAt: "2026-11-24T12:00:00.000Z",
        completedAt: null,
        curriculumVersion: "1.0.0",
        configurationVersion: "1.0.0",
        fingerprint: null,
      }),
    ).toBe(false);
  });
});
