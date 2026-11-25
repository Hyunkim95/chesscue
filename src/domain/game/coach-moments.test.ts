import { Chess } from "chess.js";
import { expect, test } from "vitest";

import { savedCoachMoments } from "./coach-moments";
import { createGameId, type GameRecord } from "./types";

test("flags the checked d4 capture only after the opponent replies in a coached game", () => {
  const position = new Chess();
  const initialFen = position.fen();
  const playedAt = "2026-11-25T12:00:00.000Z";
  const moves = [
    "e4",
    "e5",
    "Nf3",
    "Nc6",
    "Bb5",
    "a6",
    "Bxc6",
    "dxc6",
    "d4",
    "exd4",
  ].map((san, index) => {
    const move = position.move(san);
    return {
      ply: index + 1,
      san,
      uci: move.lan,
      fenAfter: move.after,
      playedAt,
    };
  });
  const game: GameRecord = {
    schemaVersion: 1,
    id: createGameId("center-before-castling"),
    origin: { type: "tutor", mode: "coached" },
    initialFen,
    moves,
    pgn: position.pgn(),
    playerColor: "white",
    result: null,
    createdAt: playedAt,
    completedAt: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
    fingerprint: null,
  };

  expect(savedCoachMoments({ ...game, moves: moves.slice(0, -1) })).toEqual([]);
  expect(savedCoachMoments(game)).toEqual([
    {
      ply: 10,
      replayPly: 8,
      title: "The center changed before you castled",
      detail:
        "After d4, your opponent played exd4 while your king was still on e1. Castling was legal in the original position.",
    },
  ]);
  const rated: GameRecord = {
    ...game,
    origin: { type: "tutor", mode: "rated" },
  };
  expect(savedCoachMoments(rated)).toEqual([]);
  expect(savedCoachMoments({ ...rated, coachJoinedAtPly: 9 })).toEqual([]);
});
