import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import raw from "./openings.generated.json";
import { parseOpeningBook, trackOpening } from "./opening-book";
import { openingPrinciples } from "./opening-principles";

const parsed = parseOpeningBook(raw);
if (!parsed.ok) throw new Error(parsed.error);
const book = parsed.value;

function check(color: "w" | "b", ...sans: string[]) {
  const board = new Chess();
  const moves = sans.map((san) => board.move(san).lan);
  const track = trackOpening(book, moves);
  if (!track.ok) throw new Error(track.error);
  const facts = openingPrinciples({
    moves,
    color,
    theory: track.value.theory,
  });
  if (!facts.ok) throw new Error(facts.error);
  return facts.value;
}

describe("openingPrinciples", () => {
  it("flags an early queen move even when the source lists it as an opening", () => {
    expect(check("w", "e4", "e5", "Qh5")).toEqual([
      {
        kind: "early-queen",
        ply: 3,
        text: "Qh5 brings the queen out on move 2 with no minor pieces developed.",
        outlined: ["h5"],
        arrows: [["d1", "h5"]],
      },
    ]);
  });

  it("does not flag a queen that captures or retreats from an attack", () => {
    expect(check("b", "e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5")).toEqual([]);
  });

  it("accepts a main book move that moves a piece twice", () => {
    expect(check("w", "e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "Ng5")).toEqual(
      [],
    );
  });

  it("names the pieces still waiting when a piece moves twice out of book", () => {
    const [fact] = check("w", "e4", "e5", "Nf3", "Nc6", "Ng5");
    expect(fact?.kind).toBe("same-piece-twice");
    expect(fact?.text).toBe(
      "Ng5 moves the knight a second time while the knight on b1, the bishop on c1 and the bishop on f1 have not moved.",
    );
    expect(fact?.outlined).toEqual(["b1", "c1", "f1"]);
  });

  it("flags the centre, development and castling over the first ten moves", () => {
    const facts = check(
      "w",
      ...["a3", "e5", "h3", "d5", "a4", "Nf6", "h4", "Nc6", "Ra2", "Be7"],
      ...["Rh2", "O-O", "Ra3", "Be6", "Rhh3", "Qd7", "b3", "Rad8", "g3"],
    );
    expect(facts.map(({ kind, ply }) => [kind, ply])).toEqual([
      ["ignored-centre", 9],
      ["same-piece-twice", 13],
      ["same-piece-twice", 15],
      ["undeveloped-minors", 19],
      ["uncastled", 19],
    ]);
    expect(facts.at(-1)).toMatchObject({
      text: "By move 10 the king is still on e1 and has not castled.",
      arrows: [],
    });
  });

  it("stays quiet through a main line", () => {
    expect(
      check(
        "w",
        ...["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O"],
        ...["Be7", "Re1", "b5", "Bb3", "d6", "c3", "O-O", "h3", "Bb7", "d4"],
      ),
    ).toEqual([]);
  });

  it("rejects an illegal move", () => {
    expect(
      openingPrinciples({ moves: ["e2e5"], color: "w", theory: [] }),
    ).toEqual({ ok: false, error: "illegal-move" });
  });
});
