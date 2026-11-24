import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportGamesPanel } from "./ImportGamesPanel";

afterEach(cleanup);

describe("ImportGamesPanel", () => {
  it("keeps the primary action disabled until PGN is present", () => {
    render(<ImportGamesPanel onImport={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Import games" })).toBeDisabled();
  });

  it("shows clear accepted, duplicate, and rejected outcomes", async () => {
    const onImport = vi.fn().mockResolvedValue({
      acceptedCount: 1,
      duplicateCount: 1,
      rejectedCount: 1,
      items: [
        { status: "accepted", index: 0, game: {} },
        {
          status: "duplicate",
          index: 1,
          fingerprint: "fingerprint",
          issue: {
            code: "duplicate-game",
            message: "Game 2 is already in your library.",
          },
        },
        {
          status: "rejected",
          index: 2,
          issue: {
            code: "malformed-pgn",
            message: "Game 3 contains an illegal move.",
          },
        },
      ],
    });
    render(<ImportGamesPanel onImport={onImport} />);

    fireEvent.change(screen.getByLabelText("Paste completed PGN games"), {
      target: { value: '[Event "Practice"]' },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import games" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: "1 accepted, 1 duplicate, 1 rejected",
        }),
      ).toBeVisible();
    });
    expect(onImport).toHaveBeenCalledWith({
      text: '[Event "Practice"]',
      source: { type: "paste" },
    });
    expect(
      screen.getByText(/influence weakness evidence and lesson focus/),
    ).toBeVisible();
    expect(
      screen.getByText("Game 2 is already in your library."),
    ).toBeVisible();
    expect(screen.getByText("Game 3 contains an illegal move.")).toBeVisible();
  });
});
