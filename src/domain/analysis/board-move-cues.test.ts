import { Chess } from "chess.js";
import { expect, it } from "vitest";

import { boardMoveCue, openedPawnExchange } from "./board-move-cues";

it("shows a pawn exchange only when the newly opened defender can legally recapture", () => {
  const board = new Chess("4k3/8/7p/4p3/8/8/3P4/3QK3 w - - 0 1");
  const move = board.move("d4");
  const exchange = openedPawnExchange(board, move);
  expect(exchange?.capture.san).toBe("exd4");
  expect(exchange?.recapture.san).toBe("Qxd4");

  const pinned = new Chess("4k3/8/7p/4p3/8/8/3P4/r2QK3 w - - 0 1");
  expect(openedPawnExchange(pinned, pinned.move("d4"))).toBeUndefined();
});

it("marks the king’s blocked and attacked escape squares after mate", () => {
  const board = new Chess("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1");
  const move = board.move("Ra8#");
  const cue = boardMoveCue(board, move);

  expect(cue?.arrows).toContainEqual({ from: "a8", to: "g8", kind: "threat" });
  expect(cue?.squares).toContainEqual({
    square: "h8",
    glyph: "×",
    label: "h8 is covered from a8.",
  });
  expect(cue?.squares).toContainEqual({
    square: "g7",
    glyph: "×",
    label: "The king’s own piece occupies g7.",
  });
  expect(cue?.squares).toHaveLength(5);
  expect(board.get("g8")?.type).toBe("k");
});

it("shows the defender’s old square only after a capture verifies the loss", () => {
  const board = new Chess("6k1/7p/3q4/8/3P4/5N2/7P/6K1 w - - 0 1");
  const previous = board.move("Ng5");
  expect(boardMoveCue(board, previous)).toBeUndefined();
  const move = board.move("Qxd4+");
  const cue = boardMoveCue(board, move, previous);

  expect(cue?.ghost?.from).toBe("f3");
  expect(cue?.arrows).toContainEqual({ from: "f3", to: "d4", kind: "threat" });
  expect(boardMoveCue(new Chess(move.before), move, previous)).toBeUndefined();
});

it("shows a recapture without a ghost defender on the captured pawn’s old square", () => {
  const board = new Chess("4k3/8/7p/4p3/8/8/3P4/3QK3 w - - 0 1");
  board.move("d4");
  const capture = board.move("exd4");
  const recapture = board.move("Qxd4");

  expect(boardMoveCue(board, recapture, capture)).toEqual({
    arrows: [{ from: "d1", to: "d4", kind: "move" }],
  });
});

it("points to both targets of a checking move that cannot be captured", () => {
  const fen = "4k3/7q/8/8/4N3/8/8/4K3 w - - 0 1";
  const board = new Chess(fen);
  expect(
    boardMoveCue(board, board.move("Nf6+"))?.squares?.map(
      ({ square }) => square,
    ),
  ).toEqual(["e8", "h7"]);

  const similar = new Chess(fen);
  expect(boardMoveCue(similar, similar.move("Nd6+"))?.squares).toBeUndefined();
});
