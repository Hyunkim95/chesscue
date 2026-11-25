import { Chess, type Move } from "chess.js";
import { z } from "zod";
import type { StudyLesson } from "./roadmap";
import type { PlayerColor } from "../game/types";

const surname = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[\p{L} '-]+$/u);
export const gameLocatorSchema = z.object({
  white: surname,
  black: surname,
  year: z.number().int().min(1475).max(2100),
});
export type GameLocator = z.infer<typeof gameLocatorSchema>;
export interface HistoricalGame {
  lesson: StudyLesson;
  orientation: PlayerColor;
  scoreUrl: string;
}

function normalized(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function displayName(pgnName: string) {
  const [family, given] = pgnName.split(", ");
  return given && family ? [given, family].join(" ") : pgnName;
}

export function playerArchives(game: GameLocator): string[] {
  return [...new Set([game.white, game.black].map(normalized))]
    .filter(Boolean)
    .map(
      (name) =>
        "https://raw.githubusercontent.com/rozim/ChessData/master/PgnMentor/" +
        name.charAt(0).toUpperCase() +
        name.slice(1) +
        ".pgn",
    );
}

export interface ArchiveScore {
  title: string;
  moves: readonly Move[];
}

export function moveNotation(move: Move) {
  return (
    String(move.before.split(" ")[5]) +
    (move.color === "w" ? ". " : "... ") +
    move.san
  );
}

// Only legal, complete scores with the requested identity reach the model.
export function matchingScores(
  archive: string,
  game: GameLocator,
): ArchiveScore[] {
  const scores: ArchiveScore[] = [];
  for (const pgn of archive.split(/\r?\n(?=\[Event ")/)) {
    const tag = (name: string) =>
      new RegExp("^\\[" + name + ' "([^"\\r\\n]+)"\\]', "m").exec(pgn)?.[1] ??
      "";
    const white = tag("White");
    const black = tag("Black");
    const year = tag("Date").slice(0, 4);
    if (
      normalized(white.split(",")[0] ?? "") !== normalized(game.white) ||
      normalized(black.split(",")[0] ?? "") !== normalized(game.black) ||
      year !== String(game.year) ||
      pgn.length > 65536
    )
      continue;
    const result = tag("Result");
    if (
      !["1-0", "0-1", "1/2-1/2"].includes(result) ||
      !pgn.trimEnd().endsWith(result)
    )
      continue;
    try {
      const board = new Chess();
      board.loadPgn(pgn);
      const moves = board.history({ verbose: true });
      if (!moves.length || moves.length > 600) continue;
      scores.push({
        title:
          displayName(white) + " vs. " + displayName(black) + " (" + year + ")",
        moves,
      });
      if (scores.length === 6) break;
    } catch {
      // Other games in this player's collection can still provide a verified match.
    }
  }
  return scores;
}

export function recordedPosition(
  score: ArchiveScore,
  notation: string,
  scoreUrl: string,
): HistoricalGame | null {
  const index = score.moves.findIndex(
    (move) => moveNotation(move) === notation,
  );
  const turn = score.moves[index];
  if (!turn) return null;
  const orientation = turn.color === "w" ? "white" : "black";
  return {
    scoreUrl,
    orientation,
    lesson: {
      title: score.title,
      fen: turn.before,
      question:
        "What would you play here as " +
        (orientation === "white" ? "White" : "Black") +
        "?",
      insight: "The recorded game continued with " + notation + ".",
      continuation: score.moves.slice(index, index + 5).map((move) => move.san),
    },
  };
}
