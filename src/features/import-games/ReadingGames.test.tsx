import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReadingGames, type ReadingGamesProps } from "./ReadingGames";

afterEach(cleanup);

const props: ReadingGamesProps = {
  gameIndex: 2,
  total: 5,
  opponent: "Ahmed",
  move: 23,
  fen: "r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 8",
  momentsFound: 1,
};

describe("ReadingGames", () => {
  it("shows the game being read on a read-only board", () => {
    render(<ReadingGames {...props} />);
    expect(
      screen.getByRole("heading", { name: "Reading your games…" }),
    ).toBeVisible();
    const board = screen.getByRole("grid", {
      name: "Your game vs Ahmed, move 23",
    });
    expect(board.querySelector("button")).toBeNull();
    expect(screen.getByText("Game 2 of 5 · vs Ahmed · move 23")).toBeVisible();
  });

  it("reports progress through a progressbar", () => {
    render(<ReadingGames {...props} />);
    const bar = screen.getByRole("progressbar", { name: "Games read" });
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "5");
    expect(bar).toHaveAttribute("aria-valuetext", "Reading game 2 of 5");
  });

  it("counts moments found so far", () => {
    const { rerender } = render(<ReadingGames {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 moment found so far",
    );
    rerender(<ReadingGames {...props} momentsFound={3} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "3 moments found so far",
    );
  });

  it("hides the moment count until one is found", () => {
    render(<ReadingGames {...props} momentsFound={0} />);
    expect(screen.queryByText(/found so far/)).toBeNull();
    expect(
      screen.getByText(
        "Stockfish checks every move on your device. You can leave; I'll keep going.",
      ),
    ).toBeVisible();
  });
});
