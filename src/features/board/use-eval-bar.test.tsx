import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { AssessPosition } from "../../application/analyze-game/assess-position";
import { ChessBoard } from "./ChessBoard";
import { useEvalBar } from "./use-eval-bar";

afterEach(cleanup);

function Board({
  fen,
  assess,
}: {
  readonly fen: string;
  readonly assess: AssessPosition | undefined;
}) {
  return (
    <ChessBoard fen={fen} label="Board" balance={useEvalBar(fen, assess)} />
  );
}

const bar = () => screen.queryByRole("img", { name: /^Stockfish: / });

it("reads a finished game without Stockfish", () => {
  const assess = vi.fn<AssessPosition>();
  // Fool's mate: Black has mated.
  render(
    <Board
      fen="rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
      assess={assess}
    />,
  );
  expect(bar()).toHaveAccessibleName("Stockfish: Black has won by mate");
  expect(assess).not.toHaveBeenCalled();
});

it("holds the last reading while the next position is checked", async () => {
  let answer: (cp: number) => void = () => undefined;
  const assess: AssessPosition = () =>
    new Promise((resolve) => {
      answer = (whiteCentipawns) => {
        resolve({ kind: "estimate", whiteCentipawns });
      };
    });
  const start = "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1";
  const { rerender } = render(<Board fen={start} assess={assess} />);
  expect(bar()).toHaveAccessibleName("Stockfish: Stockfish is checking");
  answer(250);
  expect(
    await screen.findByRole("img", { name: "Stockfish: White is better" }),
  ).toBeInTheDocument();
  rerender(<Board fen="4k3/8/8/8/8/4P3/8/4K3 b - - 0 1" assess={assess} />);
  expect(bar()).toHaveAccessibleName("Stockfish: White is better");
});

it("shows no bar without an engine", () => {
  render(<Board fen="4k3/8/8/8/8/8/4P3/4K3 w - - 0 1" assess={undefined} />);
  expect(bar()).toBeNull();
});
