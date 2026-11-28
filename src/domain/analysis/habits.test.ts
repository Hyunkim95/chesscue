import { describe, expect, it } from "vitest";

import { costliestHabit, ignoredThreats, type HabitGame } from "./habits";

// Lichess game, White to move: Black's queen on e4 attacks the rook on h1,
// which has no defender. White takes a bishop with Nxd7 and Black takes the
// rook.
const LICHESS =
  "r3kb1r/pp1b1ppp/2p1p3/2P1N3/1P1Pq3/6P1/3BBP1P/R2QK2R w KQkq - 1 17";

// Lichess game, Black to move but in check from the rook on b8: Ke7 answers
// the check, so leaving the bishop on g2 to Kxg2 was forced.
const FORCED = "1R3k2/6q1/4B1pp/4Pp2/3p4/8/P1P2PbP/4R1K1 b - - 0 26";

// White's rook on a1 hangs to the bishop on h8; Black's rook on h7 hangs to
// the rook on h4.
const ROOKS = "6kb/7r/8/8/7R/8/8/R5K1 w - - 0 20";

describe("ignoredThreats", () => {
  it("finds an attacked piece the player left for the opponent to take", () => {
    expect(ignoredThreats(["Nxd7", "Qxh1+"], "w", LICHESS)).toEqual([
      {
        ply: 0,
        fen: LICHESS,
        played: "Nxd7",
        square: "h1",
        piece: "r",
        attackers: ["e4"],
        takenWith: "Qxh1+",
      },
    ]);
    expect(ignoredThreats(["Nxd7", "Qxh1+"], "b", LICHESS)).toEqual([]);
  });

  it("does not count a fair trade", () => {
    expect(ignoredThreats(["Rxh7", "Bxa1"], "w", ROOKS)).toEqual([]);
    expect(ignoredThreats(["Rh5", "Bxa1"], "w", ROOKS)).toMatchObject([
      { square: "a1", piece: "r", played: "Rh5" },
    ]);
  });

  it("does not count a move made to answer check", () => {
    expect(ignoredThreats(["Ke7", "Kxg2"], "b", FORCED)).toEqual([]);
    const checked = "4k2r/8/8/8/3b4/8/8/R6K w - - 0 20";
    expect(ignoredThreats(["Kg2", "Bxa1"], "w", checked)).toEqual([]);
    const free = "4k3/8/8/8/3b4/8/8/R6K w - - 0 20";
    expect(ignoredThreats(["Kg2", "Bxa1"], "w", free)).toHaveLength(1);
  });

  it("does not count a piece the move itself put in danger", () => {
    const blocked = "6kb/8/8/8/8/8/1N6/R5K1 w - - 0 20";
    expect(ignoredThreats(["Nd3", "Bxa1"], "w", blocked)).toEqual([]);
  });

  it("does not count a capture that wins nothing", () => {
    const defended = "6kb/8/8/8/8/8/K6P/N7 w - - 0 20";
    expect(ignoredThreats(["h3", "Bxa1"], "w", defended)).toEqual([]);
  });

  it("skips the opening and rejects an illegal score", () => {
    const early = "6kb/7r/8/8/7R/8/8/R5K1 w - - 0 5";
    expect(ignoredThreats(["Rh5", "Bxa1"], "w", early)).toEqual([]);
    expect(ignoredThreats(["Rh5", "Ke2"], "w", ROOKS)).toBeUndefined();
    expect(ignoredThreats(["e4"], "w", "not a fen")).toBeUndefined();
  });
});

describe("costliestHabit", () => {
  const hit = (id: string): HabitGame => ({
    id,
    sans: ["Rh5", "Bxa1"],
    side: "w",
    startFen: ROOKS,
  });
  const clean = (id: string): HabitGame => ({
    id,
    sans: ["Rxh7", "Bxa1"],
    side: "w",
    startFen: ROOKS,
  });
  const games = (hits: number, total: number) =>
    Array.from({ length: total }, (_, i) =>
      i < hits ? hit(`g${String(i)}`) : clean(`g${String(i)}`),
    );

  it("waits for ten games", () => {
    expect(costliestHabit(games(5, 9))).toEqual({
      status: "too-few-games",
      analysed: 9,
      needed: 10,
    });
  });

  it("says when nothing costly stands out", () => {
    expect(costliestHabit(games(2, 10))).toEqual({
      status: "none",
      analysed: 10,
    });
  });

  it("names the habit with three examples from the newest games", () => {
    const result = costliestHabit(games(4, 12));
    expect(result).toMatchObject({
      status: "habit",
      id: "ignored-threat",
      analysed: 12,
      games: 4,
    });
    expect(
      result.status === "habit" ? result.examples.map(({ game }) => game) : [],
    ).toEqual(["g0", "g1", "g2"]);
  });

  it("leaves illegal scores out of the count", () => {
    const broken: HabitGame = {
      id: "bad",
      sans: ["Ke2"],
      side: "w",
      startFen: ROOKS,
    };
    expect(costliestHabit([...games(3, 9), broken])).toMatchObject({
      status: "too-few-games",
      analysed: 9,
    });
  });
});
