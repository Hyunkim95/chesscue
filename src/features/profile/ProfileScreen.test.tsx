import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { activeProfile, newProfile, topProfile } from "./demo/fixtures";
import { ProfileScreen } from "./ProfileScreen";

afterEach(cleanup);

describe("ProfileScreen", () => {
  it("shows the rank line with the monthly rating change", () => {
    render(<ProfileScreen {...activeProfile} />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Hyun" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent === "Jade rank · rated 1240 ▲ 38 this month",
      ),
    ).toBeVisible();
  });

  it("shows a falling rating with a down arrow and no change when flat", () => {
    const { unmount } = render(<ProfileScreen {...topProfile} />);
    expect(screen.getByText(/▼ 12 this month/)).toBeVisible();
    unmount();
    render(<ProfileScreen {...newProfile} />);
    expect(screen.queryByText(/this month/)).toBeNull();
  });

  it("shows streak with best, XP with level, and opens the sky from ideas spotted", () => {
    const onOpenSky = vi.fn();
    render(<ProfileScreen {...activeProfile} onOpenSky={onOpenSky} />);
    expect(screen.getByText("day streak · best 9")).toBeVisible();
    expect(screen.getByText("XP · level 4")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "2 ideas spotted. Open your sky" }),
    );
    expect(onOpenSky).toHaveBeenCalledOnce();
  });

  it("marks the current rank on the path and says how far the next one is", () => {
    render(<ProfileScreen {...activeProfile} />);
    const steps = within(
      screen.getByRole("region", { name: "Rank path" }),
    ).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "Copper",
      "Jade",
      "Sapphire",
      "Amethyst",
      "Crown",
    ]);
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent === "Sapphire at 1350 · 110 rating points to go",
      ),
    ).toBeVisible();
  });

  it("says Crown is the top rank when there is no next rank", () => {
    render(<ProfileScreen {...topProfile} />);
    expect(
      screen.getByText("Crown is the top rank. You made it."),
    ).toBeVisible();
  });

  it("lists earned achievements first and locked ones with a Locked label", () => {
    render(<ProfileScreen {...activeProfile} />);
    const section = screen.getByRole("region", { name: /Achievements/ });
    const titles = within(section)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("b")?.textContent);
    expect(titles).toEqual([
      "First idea",
      "First fork",
      "Played it",
      "Week one",
      "Locked: Collector",
      "Locked: Night owl",
      "Locked: Play safely",
      "Locked: Double attacks",
      "Locked: King hunts",
    ]);
    expect(within(section).getByText("4 earned")).toBeVisible();
  });

  it("shows every achievement locked for a new player", () => {
    render(<ProfileScreen {...newProfile} />);
    const section = screen.getByRole("region", { name: /Achievements/ });
    for (const item of within(section).getAllByRole("listitem"))
      expect(item).toHaveTextContent(/^Locked: /);
  });

  it("toggles Rook's voice", () => {
    const onVoiceChange = vi.fn();
    render(<ProfileScreen {...activeProfile} onVoiceChange={onVoiceChange} />);
    const toggle = screen.getByRole("switch", { name: "Rook reads aloud" });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onVoiceChange).toHaveBeenCalledWith(false);
  });

  it("disables the voice toggle with a reason when no voice is available", () => {
    render(<ProfileScreen {...newProfile} />);
    const toggle = screen.getByRole("switch", { name: "Rook reads aloud" });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText("This browser has no voice for Rook yet."),
    ).toBeVisible();
  });

  it("offers to change a saved username and to import from the other site", () => {
    const onImportFrom = vi.fn();
    render(<ProfileScreen {...activeProfile} onImportFrom={onImportFrom} />);
    expect(screen.getByText("hyunplays")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Change Lichess name" }),
    );
    expect(onImportFrom).toHaveBeenCalledWith("Lichess");
    fireEvent.click(
      screen.getByRole("button", { name: "Import from Chess.com" }),
    );
    expect(onImportFrom).toHaveBeenCalledWith("Chess.com");
  });

  it.each([
    ["signed-out", "Not signed in. Your progress stays on this device."],
    ["synced", "Synced to your account"],
    ["syncing", "Syncing…"],
    ["error", "Couldn't sync. Your progress is safe on this device."],
  ] as const)("describes the %s sync state", (syncState, text) => {
    render(<ProfileScreen {...activeProfile} syncState={syncState} />);
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });
});
