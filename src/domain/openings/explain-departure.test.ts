import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { explainDeparture } from "./explain-departure";
import raw from "./openings.generated.json";
import { parseOpeningBook, trackOpening } from "./opening-book";

const parsed = parseOpeningBook(raw);
if (!parsed.ok) throw new Error(parsed.error);
const book = parsed.value;

function departureAfter(...sans: string[]) {
  const board = new Chess();
  const track = trackOpening(
    book,
    sans.map((san) => board.move(san).lan),
  );
  if (!track.ok || !track.value.departure) throw new Error("still in book");
  return track.value.departure;
}

describe("explainDeparture", () => {
  it("compares the move with the usual book move and what it does", () => {
    const departure = departureAfter("e4", "e5", "h3");
    expect(
      explainDeparture({
        departure,
        playerColor: "w",
        scores: { bookCp: 40, playedCp: -20 },
      }),
    ).toEqual({
      text: "You left the book with h3. The usual move is Nf3, which develops the knight and controls d4 and e5. Stockfish rates h3 0.6 pawns worse.",
      bookMove: { uci: "g1f3", san: "Nf3" },
      arrows: [["g1", "f3"]],
      outlined: ["d4", "e5"],
    });
  });

  it("names the opponent and treats a small gap as equal", () => {
    const departure = departureAfter("e4", "e5", "h3");
    expect(
      explainDeparture({
        departure,
        playerColor: "b",
        scores: { bookCp: 40, playedCp: 10 },
      }).text,
    ).toBe(
      "Your opponent left the book with h3. The usual move is Nf3, which develops the knight and controls d4 and e5. Stockfish rates the two moves about the same.",
    );
  });

  it("leaves out the engine when a score is a mate", () => {
    const departure = departureAfter("e4", "e5", "h3");
    expect(
      explainDeparture({
        departure,
        playerColor: "w",
        scores: { bookCp: 99_999, playedCp: 0 },
      }).text,
    ).not.toMatch(/Stockfish/);
  });

  it("says when the book line simply ends", () => {
    expect(
      explainDeparture({
        departure: {
          ply: 3,
          color: "w",
          fenBefore: new Chess().fen(),
          playedUci: "e2e4",
          playedSan: "e4",
          playedFrom: "e2",
          playedTo: "e4",
          bookMoves: [],
        },
        playerColor: "w",
      }),
    ).toMatchObject({
      text: "You reached the end of the book line, so e4 was the first move on your own.",
      bookMove: undefined,
    });
  });
});
