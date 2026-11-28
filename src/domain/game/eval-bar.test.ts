import { expect, it } from "vitest";

import { barReading } from "./eval-bar";

const estimate = (whiteCentipawns: number) =>
  barReading({ kind: "estimate", whiteCentipawns });

it("fills the bar for the side that is better, in words, never a number", () => {
  expect(estimate(0)).toEqual({ white: 0.5, words: "About even" });
  expect(estimate(100).white).toBeCloseTo(0.59, 2);
  expect(estimate(100).words).toBe("White is a little better");
  expect(estimate(-250).words).toBe("Black is better");
  expect(estimate(-250).white).toBeLessThan(0.5);
  expect(estimate(900)).toEqual({ white: 0.96, words: "White is winning" });
});

it("fills it completely only for mate", () => {
  expect(estimate(-99_998)).toEqual({
    white: 0,
    words: "Black has a forced mate",
  });
  expect(barReading({ kind: "checkmate", winner: "white" })).toEqual({
    white: 1,
    words: "White has won by mate",
  });
  expect(barReading({ kind: "draw" })).toEqual({ white: 0.5, words: "Drawn" });
});
