import { Chess, DEFAULT_POSITION } from "chess.js";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { RookExploration } from "./RookExploration";

vi.mock("../../infrastructure/ai/rook-exploration-gemini", () => ({
  createRookExplorationCoach: () => ({
    initialize: () => Promise.resolve(),
    ask: () => Promise.resolve("What would you do next?"),
  }),
}));

const originalScroll = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  if (originalScroll)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScroll,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

test("praises a checkmate the learner plays and highlights the attacking piece", async () => {
  render(
    <RookExploration
      fen="6k1/5ppp/8/8/8/3Q4/5PPP/6K1 w - - 0 1"
      orientation="white"
      analyzeReply={vi.fn().mockResolvedValue(null)}
      onClose={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("gridcell", { name: "White queen on d3" }));
  fireEvent.click(screen.getByRole("gridcell", { name: /Empty d8/ }));
  expect(await screen.findByText("Nice find. That’s checkmate.")).toBeVisible();
  expect(
    screen.getByRole("gridcell", { name: /White queen on d8.*Rook highlight/ }),
  ).toBeVisible();
});

test("keeps Stockfish evidence and the Nano follow-up in one Rook reply", async () => {
  let resolveEngine: ((value: null) => void) | undefined;
  const engine = new Promise<null>((resolve) => {
    resolveEngine = resolve;
  });
  render(
    <RookExploration
      fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
      orientation="white"
      analyzeReply={vi.fn().mockReturnValue(engine)}
      onClose={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByRole("textbox", { name: "Ask Rook" }), {
    target: { value: "What is going on here?" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
  const log = screen.getByRole("log", { name: "Conversation with Rook" });
  expect(log.lastElementChild).toHaveTextContent("What is going on here?");
  expect(log.lastElementChild).toHaveClass("rook-chat__message--player");
  const sentAt = log.querySelector("time")?.dateTime;
  expect(sentAt).toBeDefined();
  const typing = screen.getByRole("status", { name: "Rook is typing" });
  expect(typing.children).toHaveLength(3);
  expect(log.nextElementSibling).toBe(typing);
  resolveEngine?.(null);
  await within(log).findByText(/What would you do next/);
  expect(log.lastElementChild?.previousElementSibling).toHaveTextContent(
    "What is going on here?",
  );
  expect(
    log.querySelectorAll(
      ".rook-chat__message:not(.rook-chat__message--player)",
    ),
  ).toHaveLength(1);
  expect(log).toHaveTextContent("I couldn’t check a reply here.");
  const timestamps = Array.from(
    log.querySelectorAll("time"),
    (time) => time.dateTime,
  );
  expect(timestamps).toHaveLength(2);
  expect(timestamps[0]).toBe(sentAt);
  expect(Date.parse(timestamps[1] ?? "")).toBeGreaterThanOrEqual(
    Date.parse(sentAt ?? ""),
  );
  expect(typing).not.toBeInTheDocument();
});

test.each([
  {
    fen: DEFAULT_POSITION,
    orientation: "black",
    move: "e4",
    alternative: "e5",
    best: "c7c5",
    next: "g1f3",
  },
  {
    fen: new Chess().move("e4").after,
    orientation: "white",
    move: "e5",
    alternative: "Nf3",
    best: "f1c4",
    next: "b8c6",
  },
] as const)(
  "checks either mover and accepts a similarly strong opposing reply ($orientation orientation)",
  async ({ fen, orientation, move, alternative, best, next }) => {
    const board = new Chess(fen);
    const attempt = board.move(move);
    const answer = board.move(alternative);
    const onMistake = vi.fn();
    render(
      <RookExploration
        fen={fen}
        orientation={orientation}
        onMistake={onMistake}
        analyzeReply={(position) =>
          Promise.resolve(
            position === fen
              ? {
                  line: [orientation === "black" ? "d2d4" : "c7c5"],
                  evaluationCpFromSideToMove: 30,
                }
              : position === attempt.after
                ? { line: [best], evaluationCpFromSideToMove: 220 }
                : position === answer.after
                  ? { line: [next], evaluationCpFromSideToMove: -200 }
                  : null,
          )
        }
      />,
    );
    const square = (name: string) =>
      screen.getByRole("gridcell", { name: new RegExp("\\b" + name + "\\b") });
    fireEvent.click(square(attempt.from));
    fireEvent.click(square(attempt.to));
    expect(await screen.findByText(/Find (White|Black)’s reply/)).toBeVisible();
    fireEvent.click(square(answer.from));
    fireEvent.click(square(answer.to));
    expect(await screen.findByText(/That reply works too\./)).toBeVisible();
    expect(screen.getByRole("button", { name: "Play one move" })).toBeEnabled();
    expect(onMistake).not.toHaveBeenCalled();
  },
);

test("shows what the mistake allowed, restores the decision, and opens a verified stronger line", async () => {
  const fen =
    "r1bq1rk1/pp3ppp/2n2n2/1N1pp3/5Q2/1B1P4/PPP2PPP/R3K1NR w KQ - 0 11";
  const attempt = new Chess(fen).move("Qb4");
  render(
    <RookExploration
      fen={fen}
      orientation="white"
      analyzeReply={(position) =>
        Promise.resolve(
          position === fen
            ? { line: ["f4d2", "a7a6"], evaluationCpFromSideToMove: 0 }
            : position === attempt.after
              ? { line: ["c6b4", "g1f3"], evaluationCpFromSideToMove: 500 }
              : null,
        )
      }
    />,
  );
  const square = (s: string) =>
    screen.getByRole("gridcell", { name: new RegExp("\\b" + s + "\\b") });
  const play = () => {
    fireEvent.click(square("f4"));
    fireEvent.click(square("b4"));
  };
  play();
  expect(
    await screen.findByText(/Black can take the queen on b4/),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry move" }));
  expect(square("f4")).toHaveAccessibleName(/White queen/);
  play();
  fireEvent.click(
    await screen.findByRole("button", { name: "Explain stronger move" }),
  );
  const proof = await screen.findByRole("group", {
    name: "Rook’s line explanation",
  });
  expect(proof).toHaveTextContent(
    "your queen on d2 cannot be taken immediately",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry move" }));
  expect(square("f4")).toHaveAccessibleName(/White queen/);
});
