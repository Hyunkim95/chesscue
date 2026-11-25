import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildPlayerProfile } from "../../domain/curriculum";
import * as connection from "../../domain/study/study-connection";
import { StudyScreen } from "./StudyScreen";

const { research } = vi.hoisted(() => ({ research: vi.fn() }));
vi.mock("../../infrastructure/ai/study-gemini", () => ({
  createStudyAI: () => ({ research }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const profile = buildPlayerProfile({
  initialTargetElo: 1000,
  curriculumVersion: "1",
  computedAt: "2026-01-01",
  evidence: [],
  tutorGames: [],
});

it("uses the observed pattern until the player enters a goal, and opens the verified board", async () => {
  research
    .mockResolvedValueOnce({ ok: false, error: "unverified" })
    .mockResolvedValueOnce({
      ok: true,
      value: {
        lesson: {
          title: "Verified historical game",
          fen: "6k1/8/8/8/8/8/8/K6R w - - 0 1",
          continuation: ["Rh2"],
          insight: "The game continued with Rh2.",
          question: "What would you play?",
        },
        orientation: "white",
        scoreUrl: "https://example.org/score.pgn",
      },
    });
  render(
    <StudyScreen
      profile={profile}
      storageKey="study-search-test"
      history={{ status: "ready", games: [] }}
      pattern={{
        name: "back-rank mates",
        key: "back-rank",
        games: 1,
        moves: [],
      }}
    />,
  );
  const search = screen.getByRole("button", { name: "Find game with Gemini" });
  await waitFor(() => {
    expect(search).toBeEnabled();
  });
  fireEvent.click(search);
  await screen.findByRole("alert");
  expect(research).toHaveBeenCalledWith(
    "back-rank mates",
    expect.any(AbortSignal),
  );
  expect(screen.queryByRole("grid")).toBeNull();
  fireEvent.change(screen.getByLabelText("What would you like to learn?"), {
    target: { value: "Rook activity" },
  });
  fireEvent.click(search);
  expect(
    await screen.findByRole("grid", { name: "Study board" }),
  ).toBeVisible();
  expect(research).toHaveBeenLastCalledWith(
    "Rook activity",
    expect.any(AbortSignal),
  );
  expect(
    screen.getByRole("gridcell", { name: "White rook on h1" }),
  ).toBeVisible();
  expect(
    screen.getByRole("link", { name: "PGN score collection" }),
  ).toHaveAttribute("href", "https://example.org/score.pgn");
});

it("keeps the move used for a search beside its historical board when the training plan changes", async () => {
  const source = {
    position: {
      fen: "r1bqkbnr/1pp2ppp/p1p5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 5",
      orientation: "white" as const,
      continuation: ["d4", "exd4"],
    },
    theme: "piece development",
    gameLabel: "Coached game",
    day: "2026-01-01",
    played: "5. d4",
    preferred: "5. O-O",
    candidateAction: "activate the rook by castling",
    reply: "5... exd4",
  };
  const origin = vi.spyOn(connection, "studyOrigin").mockReturnValue(source);
  research.mockResolvedValue({
    ok: true,
    value: {
      lesson: {
        title: "Castling example",
        fen: "r3kb1r/1p3ppp/p3qn2/8/8/2N1N3/PP2QPPP/R3K2R w KQkq - 1 17",
        continuation: ["O-O", "Bc5", "Rfe1"],
        insight: "White castled.",
        question: "How would you bring the rook into play?",
      },
      orientation: "white",
      scoreUrl: "https://example.org/game.pgn",
    },
  });
  const props = {
    profile,
    storageKey: "study-origin-test",
    history: { status: "ready" as const, games: [] },
    pattern: {
      name: "piece development",
      key: "development" as const,
      games: 1,
      moves: [],
    },
  };
  const rendered = render(<StudyScreen {...props} />);
  const search = screen.getByRole("button", { name: "Find game with Gemini" });
  await waitFor(() => {
    expect(search).toBeEnabled();
  });
  fireEvent.click(search);
  const panel = await screen.findByRole("region", { name: "Game connection" });
  expect(research).toHaveBeenCalledWith(
    expect.stringContaining("In my game I played 5. d4"),
    expect.any(AbortSignal),
  );
  origin.mockReturnValue(null);
  rendered.rerender(<StudyScreen {...props} pattern={undefined} />);
  expect(panel).toHaveTextContent(
    "You played 5. d4 and your opponent replied 5... exd4. Stockfish preferred 5. O-O.",
  );
  expect(panel).toHaveTextContent(
    "18. Rfe1 brought that rook to e1 on the open e-file.",
  );
  const tap = (name: string) =>
    fireEvent.click(screen.getByRole("button", { name }));
  const square = (name: RegExp) =>
    fireEvent.click(screen.getByRole("gridcell", { name }));
  tap("5. d4");
  expect(
    screen.getByRole("gridcell", { name: "White pawn on d2" }),
  ).toBeVisible();
  square(/White king on e1/);
  square(/Empty g1, legal destination/);
  expect(
    screen.getByRole("gridcell", { name: "White rook on f1" }),
  ).toBeVisible();
  tap("Back to historical board");
  expect(
    screen.getByRole("gridcell", { name: "White king on e1" }),
  ).toBeVisible();
  tap("Play 17. O-O");
  tap("Play 17... Bc5");
  tap("Your position · 5. d4");
  expect(
    screen.getByRole("gridcell", { name: "White king on g1" }),
  ).toBeVisible();
  tap("Back to historical board");
  square(/White rook on f1/);
  square(/Empty e1, legal destination/);
  expect(
    screen.getByRole("gridcell", { name: "White rook on e1" }),
  ).toBeVisible();
  expect(screen.getByText("End of recorded line")).toBeVisible();
});
