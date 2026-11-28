import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import raw from "./openings.generated.json";
import {
  parseOpeningBook,
  positionKey,
  trackOpening,
  type OpeningBook,
} from "./opening-book";

const parsed = parseOpeningBook(raw);
if (!parsed.ok) throw new Error(parsed.error);
const book: OpeningBook = parsed.value;

const uci = (...sans: string[]) => {
  const board = new Chess();
  return sans.map((san) => board.move(san).lan);
};

describe("trackOpening", () => {
  it("names the last book position and where the game left theory", () => {
    const track = trackOpening(
      book,
      uci("e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "h4", "Nf6"),
    );
    expect(track.ok && track.value.opening).toEqual({
      eco: "C50",
      name: "Italian Game: Giuoco Piano",
      ply: 6,
    });
    expect(track.ok && track.value.departure).toMatchObject({
      ply: 7,
      color: "w",
      playedSan: "h4",
    });
    expect(track.ok && track.value.departure?.bookMoves).toContain("c2c3");
  });

  it("matches the position, so a transposition gets the same name", () => {
    const a = trackOpening(book, uci("Nf3", "d5", "d4"));
    const b = trackOpening(book, uci("d4", "d5", "Nf3"));
    expect(a.ok && a.value.opening?.name).toBe(
      "Queen's Pawn Game: Zukertort Variation",
    );
    expect(b.ok && b.value.opening?.name).toBe(a.ok && a.value.opening?.name);
  });

  it("takes the later name when the game transposes back into the book", () => {
    const track = trackOpening(
      book,
      uci("e4", "c5", "Nf3", "Nc6", "Nc3", "e6", "d4", "cxd4", "Nxd4"),
    );
    expect(track.ok && track.value.departure?.ply).toBe(6);
    expect(track.ok && track.value.opening?.name).toMatch(
      /^Sicilian Defense: Taimanov Variation/,
    );
    expect(track.ok && track.value.theory.slice(5)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it("reports no departure while every move is in the book", () => {
    const track = trackOpening(book, uci("e4", "c5"));
    expect(track.ok && track.value.departure).toBeUndefined();
    expect(track.ok && track.value.opening?.name).toBe("Sicilian Defense");
  });

  it("ranks the book moves by how many named lines follow them", () => {
    const start = book.positions.get(positionKey(new Chess().fen()));
    expect(start?.moves.slice(0, 2)).toEqual(["e2e4", "d2d4"]);
  });

  it("rejects an illegal move", () => {
    expect(trackOpening(book, ["e2e5"])).toEqual({
      ok: false,
      error: "illegal-move",
    });
  });
});

describe("parseOpeningBook", () => {
  it("rejects a book that names a missing opening", () => {
    expect(
      parseOpeningBook({
        version: "x",
        openings: [],
        positions: { a: [0, ""] },
      }).ok,
    ).toBe(false);
  });
});
