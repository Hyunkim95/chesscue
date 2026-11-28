// Fixtures built from the frozen contracts, for tests only (ENGINEERING.md
// §17.5 rule 3). Product code must not import this file.
import { Chess } from "chess.js";

import type { MoveAnalysisFact } from "../analysis/types";
import { observedGameMoves, type ObservedMove } from "../curriculum/game-drill";
import { createGameId, type GameRecord } from "../game/types";
import type { MomentAttemptRecord } from "./types";

let nextId = 0;

export function attemptRecord(
  overrides: Partial<MomentAttemptRecord> = {},
): MomentAttemptRecord {
  nextId += 1;
  return {
    schemaVersion: 1,
    id: `attempt-${String(nextId)}`,
    source: { kind: "game", gameId: "game-1", ply: 35 },
    unitId: "double-attack",
    firstMoveUci: "f3g5",
    tiers: ["best"],
    outcome: "spotted",
    helped: false,
    explorations: 1,
    completedAt: "2026-11-27T09:00:00.000Z",
    ...overrides,
  };
}

// Lichess puzzle 0Uxzm: Ng5+ forks the king and queen. The board model and
// classifier both name it "double-attack".
const FORK_FEN = "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35";
const FORK_LINE = ["f3g5", "f7f6", "g5e6", "f4g3", "f2g3", "f6e6"];

// A real game position where the player either played the fork ("matched")
// or played gxf4 instead ("retry").
export function forkObservation(
  outcome: ObservedMove["outcome"],
  completedAt = "2026-11-25T10:01:00Z",
  id = "fork-game",
): ObservedMove {
  const chess = new Chess(FORK_FEN);
  const move = chess.move(outcome === "matched" ? "Ng5+" : "gxf4");
  const game: GameRecord = {
    schemaVersion: 1,
    id: createGameId(id),
    origin: { type: "pgn-paste" },
    playerColor: "white",
    result: "black-win",
    initialFen: FORK_FEN,
    moves: [
      {
        ply: 1,
        uci: move.lan,
        san: move.san,
        fenAfter: move.after,
        playedAt: completedAt,
      },
    ],
    pgn: chess.pgn(),
    createdAt: completedAt,
    completedAt,
    fingerprint: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };
  const fact: MoveAnalysisFact = {
    schemaVersion: 1,
    gameId: id,
    ply: 1,
    fenBefore: FORK_FEN,
    playedMoveUci: move.lan,
    playedMoveSan: move.san,
    evaluationBeforeCp: 723,
    evaluationAfterCp: outcome === "matched" ? 723 : -60,
    impactCp: outcome === "matched" ? 0 : 783,
    phase: "endgame",
    theme: "one-move-threat",
    recurrence: 0,
    curricularRelevance: 80,
    analysisVersion: "stockfish-19-lite@1",
    candidates: [
      { uci: "f3g5", evaluationCp: 723, principalVariation: FORK_LINE },
      {
        uci: "g3f4",
        evaluationCp: -60,
        principalVariation: ["g3f4", "f7g8"],
      },
    ],
  };
  const [observed] = observedGameMoves(game, { facts: [fact], moments: [] });
  if (!observed) throw Error("Expected a verified fork observation");
  return observed;
}

// After 3. Qh5 in a real game, the player stopped the Scholar's mate threat
// with 3...g6, Stockfish 19 lite's best at depth 16. No tactic line: a threat
// dealt with.
export function mateDefenceObservation(
  completedAt = "2026-11-26T10:01:00Z",
): ObservedMove {
  const fen =
    "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
  const chess = new Chess(fen);
  const move = chess.move("g6");
  const id = "mate-defence-game";
  const game: GameRecord = {
    schemaVersion: 1,
    id: createGameId(id),
    origin: { type: "pgn-paste" },
    playerColor: "black",
    result: "white-win",
    initialFen: fen,
    moves: [
      {
        ply: 1,
        uci: move.lan,
        san: move.san,
        fenAfter: move.after,
        playedAt: completedAt,
      },
    ],
    pgn: chess.pgn(),
    createdAt: completedAt,
    completedAt,
    fingerprint: null,
    curriculumVersion: "1.0.0",
    configurationVersion: "1.0.0",
  };
  const line = (moves: string) => moves.split(" ");
  const fact: MoveAnalysisFact = {
    schemaVersion: 1,
    gameId: id,
    ply: 1,
    fenBefore: fen,
    playedMoveUci: move.lan,
    playedMoveSan: move.san,
    evaluationBeforeCp: 28,
    evaluationAfterCp: 28,
    impactCp: 0,
    phase: "opening",
    theme: "one-move-threat",
    recurrence: 0,
    curricularRelevance: 0,
    analysisVersion: "stockfish-19-lite@1",
    candidates: [
      {
        uci: "g7g6",
        evaluationCp: 28,
        principalVariation: line("g7g6 h5f3 g8f6 g1e2 f8g7 b1c3 e8g8"),
      },
      {
        uci: "d8e7",
        evaluationCp: 11,
        principalVariation: line("d8e7 h5d1 g8f6 d2d3 c6a5 b1c3 b7b6"),
      },
      {
        uci: "d8f6",
        evaluationCp: -11,
        principalVariation: line("d8f6 b1c3 f8c5 g1f3 g7g6 h5g5 c6d4"),
      },
    ],
  };
  const [observed] = observedGameMoves(game, { facts: [fact], moments: [] });
  if (!observed) throw Error("Expected a verified mate defence");
  return observed;
}
