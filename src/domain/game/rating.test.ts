import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { createGameId, type GameRecord, type GameResult } from "./types";
import {
  INITIAL_PLAYER_ELO,
  placementCount,
  ratedOpponentElo,
  ratingHistory,
} from "./rating";
import { beginnerSearchMoves } from "./beginner-opponent";
import {
  isGameRecord,
  serializeGameRecord,
} from "../../infrastructure/persistence/game-record-validation";
import { decideGameWrite } from "../../infrastructure/persistence/write-policy";

function game(
  index: number,
  target: number,
  result: GameResult = "white-win",
): GameRecord {
  const at = new Date(Date.UTC(2026, 10, 25, 0, index)).toISOString();
  return {
    schemaVersion: 1,
    id: createGameId("game-" + String(index)),
    origin: {
      type: "tutor",
      mode: "rated",
      opponentElo: ratedOpponentElo(target),
      ...(target < 1320 ? { beginnerOpponent: { version: 1, target } } : {}),
    },
    ratingPolicy: "placement-v1",
    createdAt: at,
    completedAt: at,
    result,
    playerColor: "white",
    initialFen: new Chess().fen(),
    pgn: "",
    moves: [],
    fingerprint: null,
    configurationVersion: "1",
    curriculumVersion: "1",
  };
}
describe("five-game placement", () => {
  it.each([
    ["white-win", 1800],
    ["black-win", 400],
    ["draw", 1000],
  ] as const)(
    "places on game five for %s and uses the normal rate on game six",
    (result, elo) => {
      const games: GameRecord[] = [];
      for (let i = 1; i <= 5; i++) {
        const prior = ratingHistory(games);
        expect(placementCount(prior.at(-1))).toBe(i - 1);
        games.push(game(i, prior.at(-1)?.after ?? INITIAL_PLAYER_ELO, result));
      }
      const placed = ratingHistory(games.toReversed()).at(-1);
      expect(placed).toMatchObject({ after: elo, placementGame: 5 });
      expect(placementCount(placed)).toBeNull();
      const sixth = ratingHistory([...games, game(6, elo)]).at(-1);
      expect(sixth?.after).toBe(elo + 16);
      expect(sixth?.placementGame).toBeUndefined();
    },
  );
  it("preserves ranked legacy histories without re-placement", () => {
    const { ratingPolicy, ...legacy } = game(1, 1450, "black-win");
    expect(ratingPolicy).toBe("placement-v1");
    expect(ratingHistory([legacy, game(2, 1434)]).map((r) => r.after)).toEqual([
      1434, 1450,
    ]);
    expect(placementCount(ratingHistory([legacy])[0])).toBeNull();
    expect(serializeGameRecord(legacy)).not.toContain("ratingPolicy");
  });
  it("excludes assisted, imported and incomplete games", () => {
    const first = game(1, 1000);
    expect(
      ratingHistory([
        { ...first, coachJoinedAtPly: 0 },
        { ...first, origin: { type: "pgn-paste" } },
        { ...first, completedAt: null },
        first,
      ]),
    ).toHaveLength(1);
  });
  it("records the real engine setting, protects the beginner policy and validates its range", () => {
    const first = game(1, 1000),
      active = { ...first, completedAt: null, result: null };
    delete active.ratingPolicy;
    expect(isGameRecord(first)).toBe(true);
    expect(
      isGameRecord({
        ...first,
        origin: {
          type: "tutor",
          mode: "rated",
          opponentElo: 1320,
          beginnerOpponent: { version: 1, target: 1320 },
        },
      }),
    ).toBe(false);
    expect(
      decideGameWrite(active, { ...active, origin: game(1, 840).origin }).type,
    ).toBe("conflict");
  });
  it("samples legal candidates more often at the weakest setting, including positions where the CPU can miss mate", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
      legal = new Chess(fen).moves({ verbose: true }).map((m) => m.lan);
    function countMisses(strength: number) {
      let misses = 0;
      for (let i = 0; i < 80; i++) {
        const record = game(i, strength),
          moves = beginnerSearchMoves(record, fen);
        expect(beginnerSearchMoves(record, fen)).toEqual(moves);
        if (moves) {
          expect(moves.every((m) => legal.includes(m))).toBe(true);
          if (!moves.includes("e1e8")) misses++;
        }
      }
      return misses;
    }
    expect(countMisses(400)).toBeGreaterThan(countMisses(1150));
    expect(countMisses(1150)).toBeGreaterThan(0);
    expect(countMisses(1320)).toBe(0);
  });
});
