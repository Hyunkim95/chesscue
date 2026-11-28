import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GamesEmpty } from "./GamesEmpty";

afterEach(cleanup);

describe("GamesEmpty", () => {
  it("has Rook's line and Import my games as the one primary action", () => {
    const onImport = vi.fn();
    const { container } = render(
      <GamesEmpty onImport={onImport} onAdd={vi.fn()} />,
    );
    expect(
      screen.getByText(/and I'll find the moments worth a second look/),
    ).toBeVisible();
    expect(container.querySelectorAll(".ui-button--primary")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Import my games" }));
    expect(onImport).toHaveBeenCalledOnce();
  });

  it.each([
    ["Import from Lichess", "lichess"],
    ["Import from Chess.com", "chess-com"],
    ["Import PGN", "pgn"],
  ] as const)("adds games from %s", (label, source) => {
    const onAdd = vi.fn();
    render(<GamesEmpty onImport={vi.fn()} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onAdd).toHaveBeenCalledWith(source);
  });
});
