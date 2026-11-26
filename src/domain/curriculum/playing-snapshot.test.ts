import { Chess } from "chess.js";
import { expect, it } from "vitest";
import type { MoveAnalysisFact } from "../analysis/types";
import { createGameId, type GameRecord } from "../game/types";
import { observedGameMoves } from "./game-drill";
import { buildPlayingSnapshot, snapshotGames } from "./playing-snapshot";
import { recommendCurriculumUnit } from "./recommend-unit";

function position(id: string, found = false) {
  const fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 28",
    chess = new Chess(fen),
    move = chess.move(found ? "Re8#" : "Re2");
  const game: GameRecord = {
    schemaVersion: 1,
    id: createGameId(id),
    origin: { type: "pgn-paste" },
    playerColor: "white",
    result: found ? "white-win" : "black-win",
    initialFen: fen,
    moves: [
      {
        ply: 1,
        uci: move.lan,
        san: move.san,
        fenAfter: move.after,
        playedAt: "2026-11-25T10:00:00Z",
      },
    ],
    pgn: chess.pgn(),
    createdAt: "2026-11-25T10:00:00Z",
    completedAt: "2026-11-25T10:01:00Z",
    fingerprint: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };
  const fact: MoveAnalysisFact = {
    schemaVersion: 1,
    gameId: id,
    ply: 1,
    fenBefore: fen,
    playedMoveUci: move.lan,
    playedMoveSan: move.san,
    evaluationBeforeCp: 500,
    evaluationAfterCp: found ? 500 : 100,
    impactCp: found ? 0 : 400,
    phase: "endgame",
    theme: "one-move-threat",
    recurrence: 0,
    curricularRelevance: 80,
    analysisVersion: "stockfish-19-lite@1",
    candidates: [
      { uci: "e1e8", evaluationCp: 500, principalVariation: ["e1e8"] },
    ],
  };
  return { game, fact };
}
it("does not treat a tutor game and its PGN copy as recurrence", () => {
  const { game } = position("imported");
  const original = {
    ...game,
    id: createGameId("original"),
    origin: { type: "tutor" } as const,
  };
  expect(
    snapshotGames([
      game,
      original,
      { ...original, id: createGameId("another-session") },
    ]).map((g) => g.id),
  ).toEqual(["original", "another-session"]);
  expect(
    snapshotGames([game, { ...game, id: createGameId("same-import") }]),
  ).toEqual([game]);
});

it("requires distinct games for recurrence and preserves each supporting move", () => {
  const observations = ["a", "b", "c"].flatMap((id, i) => {
    const { game, fact } = position(id, i === 2);
    return observedGameMoves(game, { facts: [fact, fact], moments: [] });
  });
  const result = buildPlayingSnapshot([...observations, ...observations]);
  expect(result.practice).toHaveLength(1);
  expect(result.practice[0]).toMatchObject({
    name: "one-move threats",
    games: 2,
  });
  expect(result.practice[0]?.moves.map((m) => m.game.id)).toEqual(["a", "b"]);
  expect(result.strengths[0]?.moves.map((m) => m.drill.played)).toEqual([
    "Re8#",
  ]);
  const single = observations.filter((o) => o.game.id === "a");
  expect(buildPlayingSnapshot([...single, ...single]).practice[0]?.games).toBe(
    1,
  );
});
it("omits recommendations when no verified learner mistake exists", () => {
  const { game, fact } = position("clean", true);
  const verified = observedGameMoves(game, { facts: [fact], moments: [] });
  expect(buildPlayingSnapshot(verified).practice).toEqual([]);
  for (const invalid of [
    { ...game, completedAt: null },
    { ...game, playerColor: "black" as const },
    { ...game, playerColor: null },
    { ...game, id: createGameId("wrong") },
  ])
    expect(observedGameMoves(invalid, { facts: [fact], moments: [] })).toEqual(
      [],
    );
  expect(
    observedGameMoves(game, {
      facts: [{ ...fact, playedMoveSan: "Re2" }],
      moments: [],
    }),
  ).toEqual([]);
  expect(buildPlayingSnapshot([])).toEqual({
    practice: [],
    strengths: [],
    backRank: { total: 0, found: 0, missedFen: null },
  });
});

it("ranks a repeated curriculum miss ahead of a bigger one-off miss", () => {
  const attempts = ["first", "second", "one-off", "well-played"].flatMap(
    (id) => {
      const { game, fact } = position(id, id === "well-played");
      return observedGameMoves(game, { facts: [fact], moments: [] });
    },
  );
  const [first, second, oneOff, correct] = attempts;
  if (!first || !second || !oneOff || !correct)
    throw Error("Expected verified moves");
  const large = {
    ...oneOff,
    impactCp: 900,
    drill: {
      ...oneOff.drill,
      mateInOne: false,
      exercise: { ...oneOff.drill.exercise, theme: "hanging-piece" as const },
    },
  };
  expect(recommendCurriculumUnit([correct])).toBeNull();
  expect(recommendCurriculumUnit([first, first, large])?.unitId).toBe(
    "count-captures",
  );
  expect(
    recommendCurriculumUnit([first, second, large, correct]),
  ).toMatchObject({ unitId: "simple-mates", games: 2 });
});
