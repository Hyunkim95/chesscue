import { describe, expect, it } from "vitest";

import { fingerprintCanonicalGame } from "./fingerprint";
import { parsePgnBatch } from "./pgn-parser";

const WHITE_WIN = `[Event "Practice"]
[Site "Local"]
[Date "2026.11.24"]
[Round "1"]
[White "Learner"]
[Black "Opponent"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

const DRAW = `[Event "Second game"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 1/2-1/2`;

describe("parsePgnBatch", () => {
  it("normalizes a completed standard game", () => {
    const result = parsePgnBatch(WHITE_WIN);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const item = result.items[0];
    expect(item?.status).toBe("parsed");
    if (item?.status !== "parsed") return;
    expect(item.game.moves).toHaveLength(6);
    expect(item.game.moves[0]?.uci).toBe("e2e4");
    expect(item.game.result).toBe("white-win");
    expect(item.game.fingerprint).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("returns partial success for independent games", () => {
    const incomplete = `[Event "Incomplete"]\n[Result "*"]\n\n1. e4 e5 *`;
    const result = parsePgnBatch(`${WHITE_WIN}\n\n${incomplete}\n\n${DRAW}`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((item) => item.status)).toEqual([
      "parsed",
      "rejected",
      "parsed",
    ]);
  });

  it("rejects unsupported variants without discarding other games", () => {
    const chess960 = `[Event "Variant"]\n[Variant "Chess960"]\n[Result "1-0"]\n\n1. e4 e5 1-0`;
    const result = parsePgnBatch(`${chess960}\n\n${DRAW}`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]).toMatchObject({
      status: "rejected",
      issue: { code: "unsupported-variant" },
    });
    expect(result.items[1]?.status).toBe("parsed");
  });

  it("rejects illegal PGN moves", () => {
    const result = parsePgnBatch(
      `[Event "Illegal"]\n[Result "1-0"]\n\n1. e4 e5 2. Bh6 1-0`,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items[0]).toMatchObject({
      status: "rejected",
      issue: { code: "malformed-pgn" },
    });
  });

  it("bounds total bytes and game count", () => {
    const bytes = parsePgnBatch(WHITE_WIN, {
      maxBytes: 10,
      maxGames: 10,
      maxPlies: 100,
    });
    const games = parsePgnBatch(`${WHITE_WIN}\n\n${DRAW}`, {
      maxBytes: 10_000,
      maxGames: 1,
      maxPlies: 100,
    });

    expect(bytes).toMatchObject({
      ok: false,
      issue: { code: "input-too-large" },
    });
    expect(games).toMatchObject({
      ok: false,
      issue: { code: "too-many-games" },
    });
  });
});

describe("fingerprintCanonicalGame", () => {
  it("depends on the initial position and legal move sequence only", () => {
    const first = fingerprintCanonicalGame("start", ["e2e4", "e7e5"]);
    const same = fingerprintCanonicalGame("start", ["e2e4", "e7e5"]);
    const different = fingerprintCanonicalGame("start", ["d2d4", "d7d5"]);

    expect(first).toBe(same);
    expect(first).not.toBe(different);
  });
});
