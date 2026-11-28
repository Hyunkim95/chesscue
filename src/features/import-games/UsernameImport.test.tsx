import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { UsernameImport } from "./UsernameImport";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

test("imports every game in a username lookup without picking a row", async () => {
  const games = [
    {
      id: "abc123XY",
      variant: "standard",
      status: "mate",
      pgn: '[White "Mira"]\n[Black "Sam"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
    },
    {
      id: "def456XY",
      variant: "standard",
      status: "draw",
      pgn: '[White "Sam"]\n[Black "Jess"]\n[Result "1/2-1/2"]\n\n1. e4 e5 1/2-1/2',
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(games.map((game) => JSON.stringify(game)).join("\n")),
      ),
  );
  const onImport = vi.fn().mockResolvedValue(2);
  render(
    <UsernameImport
      site="lichess"
      storageKey="test-imports"
      onImport={onImport}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Lichess username" }), {
    target: { value: "Sam" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Import games" }));
  expect(await screen.findByText("Added 2 games.")).toBeVisible();
  expect(onImport).toHaveBeenCalledExactlyOnceWith(
    [
      expect.objectContaining({ id: "abc123XY", color: "black" }),
      expect.objectContaining({ id: "def456XY", color: "white" }),
    ],
    "lichess",
  );
});

test("remembers each provider separately and refreshes after reopening Games", async () => {
  const fetchGames = vi.fn((url: string | URL) =>
    Promise.resolve(
      String(url).includes("api.chess.com")
        ? Response.json({ archives: [] })
        : new Response(""),
    ),
  );
  vi.stubGlobal("fetch", fetchGames);

  const form = (
    <UsernameImport
      storageKey="player-imports"
      onImport={vi.fn().mockResolvedValue(0)}
    />
  );
  const view = render(form);
  const username = screen.getByRole("textbox", { name: "Username" });
  fireEvent.change(username, { target: { value: "Sam" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Import games from Lichess" }),
  );
  await screen.findByText("No recent completed standard chess games found.");
  // Once a name is saved, each site gets its own row.
  expect(screen.queryByRole("textbox", { name: "Username" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add Chess.com name" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Chess.com username" }),
    { target: { value: "Mira" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Import games" }));
  await screen.findByText("No recent completed standard chess games found.");
  view.unmount();

  render(form);
  expect(screen.getByText("Sam")).toBeVisible();
  expect(screen.getByText("Mira")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh Lichess games" }),
  );
  await screen.findByText("No recent completed standard chess games found.");
  fireEvent.click(
    screen.getByRole("button", { name: "Refresh Chess.com games" }),
  );
  await screen.findByText("No recent completed standard chess games found.");
  expect(fetchGames.mock.calls.map(([url]) => String(url))).toEqual([
    expect.stringMatching(/^https:\/\/lichess.org\/api\/games\/user\/sam\?/),
    "https://api.chess.com/pub/player/mira/games/archives",
    expect.stringMatching(/^https:\/\/lichess.org\/api\/games\/user\/sam\?/),
    "https://api.chess.com/pub/player/mira/games/archives",
  ]);
});

test("forgets a saved name on its provider page", () => {
  localStorage.setItem("test-imports", JSON.stringify({ lichess: "Sam" }));
  render(
    <UsernameImport
      site="lichess"
      storageKey="test-imports"
      onImport={vi.fn().mockResolvedValue(0)}
    />,
  );
  const field = screen.getByRole("textbox", { name: "Lichess username" });
  expect(field).toHaveValue("Sam");
  fireEvent.click(screen.getByRole("button", { name: "Forget Sam" }));
  expect(field).toHaveValue("");
  expect(localStorage.getItem("test-imports")).toBe("{}");
  expect(screen.queryByRole("button", { name: /Forget/ })).toBeNull();
});
