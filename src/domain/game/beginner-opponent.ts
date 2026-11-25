import { Chess } from "chess.js";
import type { GameRecord } from "./types";

export const STOCKFISH_ELO_FLOOR = 1320;
export const MIN_PLAYER_ELO = 400;

export function beginnerSearchMoves(
  game: GameRecord,
  fen: string,
): string[] | undefined {
  if (game.origin.type !== "tutor" || !game.origin.beginnerOpponent)
    return undefined;
  const strength = game.origin.beginnerOpponent.target;
  // A stable draw per position keeps replay and crash recovery on the same policy.
  let seed = 2166136261;
  for (const char of game.id + "|" + fen)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  function draw() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const restrictionChance = Math.min(
    0.9,
    (STOCKFISH_ELO_FLOOR - strength) / 600,
  );
  if (draw() >= restrictionChance) return undefined;
  const legal = new Chess(fen).moves({ verbose: true }).map((move) => move.lan);
  const sample: string[] = [];
  const limit = strength < 950 ? 1 : 2;
  while (legal.length && sample.length < limit) {
    const [move] = legal.splice(Math.floor(draw() * legal.length), 1);
    if (move) sample.push(move);
  }
  return sample.length ? sample : undefined;
}
