import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import raw from "./openings.generated.json";
import { parseOpeningBook } from "./opening-book";
import { openingReview } from "./opening-review";

const parsed = parseOpeningBook(raw);
if (!parsed.ok) throw new Error(parsed.error);
const book = parsed.value;

const ucis = (...sans: string[]) => {
  const board = new Chess();
  return sans.map((san) => board.move(san).lan);
};

describe("openingReview", () => {
  it("frames the departure, the principle slip and the opening's ideas", () => {
    const moves = ucis("e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "Ng5");
    const review = openingReview({
      book,
      moves,
      playerColor: "w",
      evaluations: new Map([
        [
          7,
          {
            playedCp: -40,
            candidates: [{ uci: "c2c3", evaluationCp: 30 }],
          },
        ],
      ]),
    });
    if (!review.ok || !review.value) throw new Error("no review");
    const { opening, summary, frames } = review.value;
    expect(opening.name).toBe("Italian Game: Giuoco Piano");
    expect(summary).toBe("You left the book on move 4");
    expect(frames.map(({ caption }) => caption)).toEqual([
      "You left the book with Ng5. The usual move is c3. Stockfish rates Ng5 0.7 pawns worse.",
      "Ng5 moves the knight a second time while the knight on b1 and the bishop on c1 have not moved.",
      "White prepares a centre with c3 and d4 while the bishop on c4 aims at f7.",
      "d4 strikes at e5, usually once c3 has prepared it.",
      "After 3...Nd4, taking on e5 walks into 4...Qg5 and a quick mate on f3.",
    ]);
    const [departure] = frames;
    expect(departure?.moveUci).toBe("f8c5");
    expect(departure?.arrows).toEqual([
      { from: "f3", to: "g5", kind: "tried" },
      { from: "c2", to: "c3", kind: "move" },
    ]);
    expect(new Chess(frames.at(-1)?.fen).isCheckmate()).toBe(true);
  });

  it("does not judge the opponent's moves or compare them with Stockfish", () => {
    const review = openingReview({
      book,
      moves: ucis("e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "Ng5"),
      playerColor: "b",
      evaluations: new Map([
        [7, { playedCp: -40, candidates: [{ uci: "c2c3", evaluationCp: 30 }] }],
      ]),
    });
    const frames = review.ok ? (review.value?.frames ?? []) : [];
    expect(review.ok && review.value?.summary).toBe(
      "Your opponent left the book on move 4",
    );
    expect(frames[0]?.caption).toBe(
      "Your opponent left the book with Ng5. The usual move is c3.",
    );
    expect(frames.some(({ caption }) => caption.includes("second time"))).toBe(
      false,
    );
  });

  it("says when every move followed the book", () => {
    const review = openingReview({
      book,
      moves: ucis("d4", "d5", "c4", "e6"),
      playerColor: "w",
    });
    expect(review.ok && review.value?.summary).toBe(
      "Every move followed the book",
    );
    expect(review.ok && review.value?.opening.name).toBe(
      "Queen's Gambit Declined",
    );
  });
});
