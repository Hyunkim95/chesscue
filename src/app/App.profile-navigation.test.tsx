import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { guestHistory } from "../infrastructure/persistence/player-history";
import { App } from "./App";

vi.mock(import("./board-first/flag"), async (importOriginal) => ({
  ...(await importOriginal()),
  boardFirst: true,
}));

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  localStorage.removeItem(guestHistory.key("username-imports"));
  vi.restoreAllMocks();
});

it("opens the player profile from Today and Review and keeps account sync reachable", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  render(<App />);
  const openProfile = () =>
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));

  openProfile();
  expect(
    await screen.findByRole("heading", { name: "Rank path" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Games" }));
  expect(screen.getByRole("heading", { name: "Your games" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Games" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    await screen.findByRole("textbox", { name: /^Username$/ }),
  ).toBeVisible();

  openProfile();
  expect(location.hash).toBe("#profile");
  expect(
    await screen.findByRole("heading", { name: "Rank path" }),
  ).toBeVisible();
  expect(
    screen.getByRole("switch", { name: "Rook reads aloud" }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Account settings" }));
  expect(location.hash).toBe("#account");
  expect(
    screen.getByRole("heading", { name: "Cross-device sync" }),
  ).toBeVisible();
});

it("shows the usernames saved by Games and prefills the provider import", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  localStorage.setItem(
    guestHistory.key("username-imports"),
    JSON.stringify({ lichess: "RapidPlayer", chesscom: "QuietKnight" }),
  );
  window.history.replaceState(null, "", "/#profile");
  render(<App />);

  expect(await screen.findByText("RapidPlayer")).toBeVisible();
  expect(screen.getByText("QuietKnight")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Change Chess.com name" }),
  );
  expect(
    await screen.findByRole("textbox", { name: "Chess.com username" }),
  ).toHaveValue("QuietKnight");
});
