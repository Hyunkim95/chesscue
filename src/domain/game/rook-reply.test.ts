import { expect, it } from "vitest";
import { rookReply } from "./rook-reply";

const moments = [
  {
    ply: 8,
    replayPly: 7,
    title: "A mate was available",
    detail: "You could play Qxf7# to end the game.",
  },
  {
    ply: 10,
    replayPly: 8,
    title: "The center changed before you castled",
    detail: "You played d4 with your king on e1.",
  },
];

it("answers the specific question with the checked past move", () => {
  expect(rookReply("What mate was available?", moments)).toEqual({
    text: "You could play Qxf7# to end the game.",
    momentPly: 8,
  });
  expect(rookReply("Why was castling relevant?", moments).momentPly).toBe(10);
});

it("asks for clarification about an unchecked move and keeps live hints out of chat", () => {
  expect(
    rookReply("What happened on move 25?", moments).momentPly,
  ).toBeUndefined();
  expect(
    rookReply("What should I play next?", moments, {
      intent: "explain",
      ply: 8,
    }).momentPly,
  ).toBeUndefined();
});
