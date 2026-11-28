import { expect, it } from "vitest";

import { planFocus, winningCaptures } from "./plan-focus";

it("counts a capture as a threat only when the exchange wins material", () => {
  // After 1. e4 e5 2. Nf3, Nxe5 wins a pawn nothing defends.
  const open = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2";
  expect(winningCaptures(open, "w")).toEqual([{ from: "f3", to: "e5" }]);
  // With Nc6 defending it, taking loses the knight for a pawn.
  const defended =
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
  expect(winningCaptures(defended, "w")).toEqual([]);
});

it("treats a check as the threat to deal with", () => {
  // 1. e4 f6 2. Qh5+: every legal move answers the check.
  expect(
    planFocus(
      "rnbqkbnr/ppppp1pp/5p2/7Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2",
      "g7g6",
    ),
  ).toEqual({
    kind: "threat",
    prompt: "First, deal with my threat.",
    arrows: [{ from: "h5", to: "e8", kind: "reply" }],
    outlines: [{ square: "e8", tone: "coral" }],
  });
});

it("ignores a threat the best move leaves standing", () => {
  // The Petrov's Nf6 counterattacks instead of saving the e5 pawn, so the
  // goal is about development, not the threat.
  expect(
    planFocus(
      "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
      "g8f6",
    )?.kind,
  ).toBe("develop");
});
