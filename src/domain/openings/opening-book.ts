import { Chess, type Color, type Move, type Square } from "chess.js";
import { z } from "zod";

import { err, ok, type Result } from "../../shared/result/result";

// Opening names and book moves keyed by position, built from
// lichess-org/chess-openings by scripts/openings/build-openings.mjs.

export interface NamedOpening {
  readonly eco: string;
  readonly name: string;
}

interface BookPosition {
  readonly opening: number;
  readonly moves: readonly string[];
}

export interface OpeningBook {
  readonly version: string;
  readonly openings: readonly NamedOpening[];
  readonly positions: ReadonlyMap<string, BookPosition>;
}

const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

const bookSchema = z.object({
  version: z.string().min(1),
  openings: z.array(z.tuple([z.string().regex(/^[A-E]\d\d$/), z.string()])),
  positions: z.record(
    z.string(),
    z.tuple([
      z.number().int().min(-1),
      z
        .string()
        .refine(
          (moves) => moves === "" || moves.split(" ").every((m) => UCI.test(m)),
        ),
    ]),
  ),
});

export function parseOpeningBook(raw: unknown): Result<OpeningBook, string> {
  const parsed = bookSchema.safeParse(raw);
  if (!parsed.success) return err("The opening book is malformed.");
  const { version, openings, positions } = parsed.data;
  const entries = Object.entries(positions);
  if (entries.some(([, [index]]) => index >= openings.length))
    return err("The opening book names an opening it does not list.");
  return ok({
    version,
    openings: openings.map(([eco, name]) => ({ eco, name })),
    positions: new Map(
      entries.map(([key, [opening, moves]]) => [
        key,
        { opening, moves: moves === "" ? [] : moves.split(" ") },
      ]),
    ),
  });
}

// The FEN without its move counters, so transpositions share a key.
export const positionKey = (fen: string): string =>
  fen.split(" ").slice(0, 4).join(" ");

export interface OpeningDeparture {
  // The ply (1 = White's first move) of the first move that leaves the book.
  readonly ply: number;
  readonly color: Color;
  readonly fenBefore: string;
  readonly playedUci: string;
  readonly playedSan: string;
  readonly playedFrom: Square;
  readonly playedTo: Square;
  // Book moves from the position before it, most continued line first.
  readonly bookMoves: readonly string[];
}

// A book move counts as main theory when it is among the five most continued
// moves from its position. The source also lists offbeat lines such as 2.Qh5,
// which the opening principles should still judge.
const MAIN_BOOK_MOVES = 5;

export interface OpeningTrack {
  readonly bookVersion: string;
  // One entry per given move: whether it was a main book move.
  readonly theory: readonly boolean[];
  // The last named position within the first 40 plies.
  readonly opening: (NamedOpening & { readonly ply: number }) | undefined;
  // Undefined when every given move stays in the book.
  readonly departure: OpeningDeparture | undefined;
}

// The name comes from the last book position within this many plies, the
// window Lichess reads, so a game that leaves the book and transposes back
// takes the later name. Scored against Lichess's labels by
// scripts/openings/benchmark-openings.mjs.
const NAME_PLIES = 40;

// Follows a game from the standard start through the book. The departure is
// the first move that reaches an unknown position; moves after it are never
// main theory, even if they transpose back.
export function trackOpening(
  book: OpeningBook,
  moves: readonly string[],
): Result<OpeningTrack, "illegal-move"> {
  const board = new Chess();
  let opening: OpeningTrack["opening"];
  let departure: OpeningDeparture | undefined;
  const theory = moves.map(() => false);
  for (const [index, uci] of moves.entries()) {
    const fenBefore = board.fen();
    const from = book.positions.get(positionKey(fenBefore));
    let played: Move;
    try {
      played = board.move(uci);
    } catch {
      return err("illegal-move");
    }
    const reached = book.positions.get(positionKey(board.fen()));
    if (!departure && (!from || !reached))
      departure = {
        ply: index + 1,
        color: index % 2 === 0 ? "w" : "b",
        fenBefore,
        playedUci: uci,
        playedSan: played.san,
        playedFrom: played.from,
        playedTo: played.to,
        bookMoves: from?.moves ?? [],
      };
    if (!departure && from)
      theory[index] = from.moves.slice(0, MAIN_BOOK_MOVES).includes(uci);
    const named = reached && book.openings[reached.opening];
    if (named && index < NAME_PLIES) opening = { ...named, ply: index + 1 };
  }
  return ok({ bookVersion: book.version, theory, opening, departure });
}
