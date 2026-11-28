import { expect, it } from "vitest";

import { movesInWords } from "./exploration-intent";

// How players word "what if" (owner, 28 November 2026): Rook plays out the
// move they mean, or offers at most three that fit, and never plays a move
// they did not mean. Target: at least 90% understood, none wrong.

// Puzzle 0HfcA, White to move.
const A = "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19";
// An Italian game, Black to move.
const B = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";

// [position, words, the moves that fit them]
const PHRASES: readonly (readonly [string, string, readonly string[]])[] = [
  [A, "what if Qxg5", ["Qxg5+"]],
  [A, "what if queen takes g5", ["Qxg5+"]],
  [A, "what if I take on g5", ["Qxg5+"]],
  [A, "what if I take the pawn on g5", ["Qxg5+"]],
  [A, "what if my queen goes to h5", ["Qh5"]],
  [A, "what if queen h5", ["Qh5"]],
  [A, "wat if qh5", ["Qh5"]],
  [A, "what if I played queen to h5 instead", ["Qh5"]],
  [A, "what if I move my rook to f2", ["Rf2"]],
  [A, "what about rook f2", ["Rf2"]],
  [A, "why not push the h pawn", ["h3", "h4"]],
  [A, "what if I push my h pawn two squares", ["h4"]],
  [A, "what if the king moves", ["Kg1"]],
  [A, "what if I play king g1", ["Kg1"]],
  [A, "what if I give check", ["Qxg5+"]],
  [A, "what if a4", ["a4"]],
  [A, "what if pawn b4", ["b4"]],
  [A, "what if the rook goes to d1", ["Rad1", "Rfd1"]],
  [A, "what if my a1 rook goes to d1", ["Rad1"]],
  [A, "what if I take the pawn with my queen", ["Qxg5+", "Qxe6"]],
  [A, "what if I take e6", ["Qxe6"]],
  [A, "what if I move my queen to the d file", ["Qd1", "Qd4"]],
  [B, "what if knight f6", ["Nf6"]],
  [B, "what if I develop my bishop to c5", ["Bc5"]],
  [B, "what if Bc5", ["Bc5"]],
  [B, "what if I push the d pawn", ["d6", "d5"]],
  [B, "what if pawn to d6", ["d6"]],
  [B, "what if h6", ["h6"]],
  [B, "what if queen f6", ["Qf6"]],
  [B, "what if my knight goes to d4", ["Nd4"]],
  [B, "what if Nd4", ["Nd4"]],
  [B, "what if bishop e7", ["Be7"]],
  [B, "what if I attack the bishop", ["Na5", "b5", "d5"]],
  [B, "what if I play the knight from g8 to f6", ["Nf6"]],
  [B, "what if knight to the middle", ["Nd4"]],
  [B, "what if nf6", ["Nf6"]],
  [B, "what if the horse goes to f6", ["Nf6"]],
  [B, "what if I move the queen next to the king", ["Qe7", "Qf6"]],
];

function read(fen: string, words: string, fits: readonly string[]) {
  const sans = movesInWords(words, fen).map(({ san }) => san);
  if (sans.length === 0) return "none";
  if (sans.some((san) => !fits.includes(san)) || sans.length > 3)
    return "wrong";
  return "understood";
}

it("never plays a move the player did not mean", () => {
  const wrong = PHRASES.filter(
    ([fen, words, fits]) => read(fen, words, fits) === "wrong",
  ).map(([fen, words]) => ({
    words,
    read: movesInWords(words, fen).map(({ san }) => san),
  }));
  expect(wrong).toEqual([]);
});

it("understands at least 90% of the ways players word a move", () => {
  const understood = PHRASES.filter(
    ([fen, words, fits]) => read(fen, words, fits) === "understood",
  ).length;
  expect(understood / PHRASES.length).toBeGreaterThanOrEqual(0.9);
});

it("reads nothing into words that name no move", () => {
  expect(movesInWords("what do you think", A)).toEqual([]);
  expect(movesInWords("what if", B)).toEqual([]);
});
