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
  it("keeps the primary action disabled until PGN and learner color are present", () => {
    render(<ImportGamesPanel onImport={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Import games" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Paste completed PGN games"), {
      target: { value: '[Event "Practice"]' },
    });
    expect(screen.getByRole("button", { name: "Import games" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "I played White" }));
    expect(screen.getByRole("button", { name: "Import games" })).toBeEnabled();
  });

  it("shows clear accepted, duplicate, and rejected outcomes", async () => {
    const onImport = vi.fn().mockResolvedValue({
      acceptedCount: 1,
      duplicateCount: 1,
      rejectedCount: 1,
      items: [
        {
          status: "accepted",
          index: 0,
          game: { record: { playerColor: "white" } },
        },
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
    fireEvent.click(screen.getByRole("radio", { name: "I played White" }));
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
      playerColor: "white",
    });
    expect(
      screen.getByText(/influence weakness evidence and lesson focus/),
    ).toBeVisible();
    expect(
      screen.getByText("Game 2 is already in your library."),
    ).toBeVisible();
    expect(screen.getByText("Game 3 contains an illegal move.")).toBeVisible();
    expect(screen.getByText(/Accepted as White/)).toBeVisible();
  });

  it("retains the text and learner color after a recoverable error", async () => {
    const onImport = vi.fn().mockRejectedValue(new Error("temporary failure"));
    render(<ImportGamesPanel onImport={onImport} />);

    const text = screen.getByLabelText("Paste completed PGN games");
    const black = screen.getByRole("radio", { name: "I played Black" });
    fireEvent.change(text, { target: { value: '[Event "Practice"]' } });
    fireEvent.click(black);
    fireEvent.click(screen.getByRole("button", { name: "Import games" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeVisible();
    });
    expect(text).toHaveValue('[Event "Practice"]');
    expect(black).toBeChecked();
    expect(screen.getByRole("button", { name: "Import games" })).toBeEnabled();
    expect(
      screen.getByText(/Import mixed-color games in separate batches/),
    ).toBeVisible();
  });
});
