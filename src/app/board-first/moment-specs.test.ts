import { Chess } from "chess.js";
import { expect, it } from "vitest";

import type { MoveAnalysisFact } from "../../domain/analysis/types";
import { createGameId, type GameRecord } from "../../domain/game/types";
import { momentFromGame, pickGameReviewMoment } from "./moment-specs";

const fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 28";
const date = "2026-11-28T10:00:00Z";

function reviewedGame(found: boolean) {
  const chess = new Chess(fen);
  const move = chess.move(found ? "Re8#" : "Re2");
  const game: GameRecord = {
    schemaVersion: 1,
    id: createGameId("game-1"),
    origin: { type: "pgn-upload", sourceName: "chesscom-101.pgn" },
    playerColor: "white",
    result: found ? "white-win" : "black-win",
    initialFen: fen,
    moves: [
      {
        ply: 1,
        uci: move.lan,
        san: move.san,
        fenAfter: move.after,
        playedAt: date,
      },
    ],
    pgn: chess.pgn(),
    createdAt: date,
    completedAt: date,
    fingerprint: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };
  const fact: MoveAnalysisFact = {
    schemaVersion: 1,
    gameId: game.id,
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

it.each([false, true])(
  "opens the recorded decision in a Moment when the best move was found: %s",
  (found) => {
    const { game, fact } = reviewedGame(found);
    const selected = pickGameReviewMoment(game, { facts: [fact], moments: [] });
    expect(selected?.outcome).toBe(found ? "matched" : "retry");
    expect(selected && momentFromGame(selected, new Map())).toMatchObject({
      fen,
      bestUci: "e1e8",
      playedInGame: { san: found ? "Re8#" : "Re2" },
      source: { kind: "game", gameId: game.id, ply: 1 },
    });
  },
);

it("keeps classic Review available when the checked move cannot be verified against the game", () => {
  const { game, fact } = reviewedGame(false);
  expect(
    pickGameReviewMoment(game, {
      facts: [{ ...fact, playedMoveSan: "Re3" }],
      moments: [],
    }),
  ).toBeUndefined();
});
