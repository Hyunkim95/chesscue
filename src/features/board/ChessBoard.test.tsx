import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ChessBoard } from "./ChessBoard";

afterEach(cleanup);

// Coordinates sit on the edges only, like most boards (owner, 28 November
// 2026): ranks down the left, files along the bottom, no label per square.
it("labels the edges, not every square", () => {
  const { container } = render(
    <ChessBoard fen="8/8/8/8/8/8/8/4K2k w - - 0 1" label="Board" />,
  );
  const text = (selector: string) =>
    [...container.querySelectorAll(selector)].map(
      ({ textContent }) => textContent,
    );
  expect(text(".chess-board__coordinate")).toEqual([]);
  expect(text(".chess-board__edge-coordinate--rank")).toEqual([
    "8",
    "7",
    "6",
    "5",
    "4",
    "3",
    "2",
    "1",
  ]);
  expect(text(".chess-board__edge-coordinate--file")).toEqual([
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
  ]);
});
