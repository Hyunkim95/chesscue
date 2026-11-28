import { Chess, DEFAULT_POSITION } from "chess.js";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { RookExploration } from "./RookExploration";
import { withBestMoveReplies } from "../../test/best-move-replies";

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
  const analyzeReply = vi.fn().mockResolvedValue(null);
  render(
    <RookExploration
      fen="6k1/5ppp/8/8/8/3Q4/5PPP/6K1 w - - 0 1"
      orientation="white"
      analyzeReply={analyzeReply}
      onClose={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("gridcell", { name: "White queen on d3" }));
  fireEvent.click(screen.getByRole("gridcell", { name: /Empty d8/ }));
  expect(await screen.findByText(/Qd8# checks the king on g8/)).toBeVisible();
  expect(analyzeReply).not.toHaveBeenCalled();
  expect(
    screen.getByRole("gridcell", { name: /White queen on d8.*Rook highlight/ }),
  ).toBeVisible();
});

test("automatically explains a verified pawn exchange after a practice attempt", async () => {
  const accepted = vi.fn().mockReturnValue(true);
  render(
    <RookExploration
      fen="4k3/8/7p/4p3/8/8/3P4/3QK3 w - - 0 1"
      orientation="white"
      analyzeReply={vi
        .fn()
        .mockResolvedValue({ line: ["h6h5"], evaluationCpFromSideToMove: 20 })}
      puzzle={{ onMove: accepted, source: null }}
    />,
  );

  fireEvent.click(screen.getByRole("gridcell", { name: /White pawn on d2/ }));
  fireEvent.click(
    screen.getByRole("gridcell", { name: /Empty d4.*legal destination/ }),
  );
  expect(
    await screen.findByRole("button", { name: "d4 challenges e5." }),
  ).toBeVisible();
  expect(
    await screen.findByRole(
      "gridcell",
      { name: /Black pawn on d4/ },
      { timeout: 3500 },
    ),
  ).toBeVisible();
  expect(
    await screen.findByRole(
      "gridcell",
      { name: /White queen on d4/ },
      { timeout: 3500 },
    ),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Return to my position" }),
  );
  expect(
    screen.getByRole("gridcell", { name: /White pawn on d4/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("gridcell", { name: /Black pawn on e5/ }),
  ).toBeVisible();
  expect(accepted).toHaveBeenCalledExactlyOnceWith("d2d4");
}, 12000);

test("animates the candidate, then the reply, then the line it opens", async () => {
  const { container } = render(
    <RookExploration
      fen="4k3/7p/8/4p3/8/8/3P4/3QK3 b - - 0 1"
      orientation="white"
      analyzeReply={vi
        .fn()
        .mockResolvedValueOnce({
          line: ["d2d4"],
          evaluationCpFromSideToMove: 50,
        })
        .mockResolvedValueOnce({
          line: ["h6h5"],
          evaluationCpFromSideToMove: 10,
        })}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Ask Rook" }), {
    target: { value: "What if I play h6?" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
  expect(
    await screen.findByText("After h6, Stockfish found d4."),
  ).toBeVisible();
  expect(
    screen.getByRole("gridcell", { name: /Black pawn on h6/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("gridcell", { name: /White pawn on d2/ }),
  ).toBeVisible();
  expect(container.querySelector('[data-move-cue-arrow="d1:d4"]')).toBeNull();
  expect(
    await screen.findByRole("gridcell", { name: /White pawn on d4/ }),
  ).toBeVisible();
  expect(container.querySelector('[data-move-cue-arrow="d1:d4"]')).toBeNull();
  await waitFor(() => {
    expect(
      container.querySelector('[data-move-cue-arrow="d1:d4"]'),
    ).toHaveClass("chess-board__cue-arrow--control");
  });
  expect(
    container.querySelector('[data-move-cue-arrow="d2:d4"]'),
  ).toBeInTheDocument();
  expect(
    container.querySelector('[data-move-cue-arrow="d4:e5"]'),
  ).toBeInTheDocument();

  const challenge = screen.getByRole("button", { name: "d4 challenges e5." });
  await waitFor(() => {
    expect(challenge).toHaveAttribute("aria-current", "step");
    expect(container.querySelectorAll("[data-move-cue-arrow]")).toHaveLength(1);
  });
  expect(
    await screen.findByRole(
      "gridcell",
      { name: /Black pawn on d4/ },
      { timeout: 3500 },
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "exd4" })).toHaveAttribute(
    "aria-current",
    "step",
  );
  expect(
    await screen.findByRole(
      "gridcell",
      { name: /White queen on d4/ },
      { timeout: 3500 },
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Qxd4" })).toHaveAttribute(
    "aria-current",
    "step",
  );

  fireEvent.click(screen.getByRole("button", { name: "d4 challenges e5." }));
  expect(container.querySelectorAll("[data-move-cue-arrow]")).toHaveLength(1);
  expect(
    container.querySelector('[data-move-cue-arrow="d4:e5"]'),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "exd4" }));
  expect(
    screen.getByRole("gridcell", { name: /Black pawn on d4/ }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Qxd4" }));
  expect(
    await screen.findByRole("gridcell", { name: /White queen on d4/ }),
  ).toBeVisible();
  await waitFor(() => {
    expect(
      container.querySelector('[data-move-cue-arrow="d1:d4"]'),
    ).toBeInTheDocument();
  });

  fireEvent.click(
    await screen.findByRole("button", { name: "Try a different move" }),
  );
  expect(
    screen.getByRole("gridcell", { name: /Black pawn on h6/ }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("gridcell", { name: /White pawn on d2/ }));
  fireEvent.click(
    screen.getByRole("gridcell", { name: /Empty d3.*legal destination/ }),
  );
  expect(await screen.findByText(/After d3, Stockfish found h5/)).toBeVisible();
  expect(
    await screen.findByRole("gridcell", { name: /Black pawn on h5/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("gridcell", { name: /White pawn on d3/ }),
  ).toBeVisible();

  fireEvent.click(
    screen.getByRole("button", { name: "Return to my position" }),
  );
  expect(
    screen.getByRole("gridcell", { name: /White pawn on d2/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("gridcell", { name: /Black pawn on h7/ }),
  ).toBeVisible();
}, 12000);

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
  expect(typing.querySelector(".loading-mark img")).toBeInTheDocument();
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
        analyzeReply={withBestMoveReplies((position) =>
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
          ),
        )}
      />,
    );
    const square = (name: string) =>
      screen.getByRole("gridcell", { name: new RegExp("\\b" + name + "\\b") });
    fireEvent.click(square(attempt.from));
    fireEvent.click(square(attempt.to));
    expect(
      await screen.findByText(
        `What were you trying to do with ${attempt.san}?`,
      ),
    ).toBeVisible();
    fireEvent.click(square(answer.from));
    fireEvent.click(square(answer.to));
    expect(await screen.findByText(/That reply works too\./)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Next move" })).toBeEnabled();
    expect(onMistake).not.toHaveBeenCalled();
  },
);

test("explains the consequence beyond the first reply and can play it through", async () => {
  const fen = "8/8/8/8/3k3p/8/P3K3/8 w - - 0 1";
  const move = new Chess(fen).move("Kd2");
  render(
    <RookExploration
      fen={fen}
      orientation="white"
      puzzle={{ onMove: () => false, source: null }}
      analyzeReply={withBestMoveReplies((position) =>
        Promise.resolve(
          position === fen
            ? { line: ["e2f3"], evaluationCpFromSideToMove: 0 }
            : position === move.after
              ? {
                  line: ["h4h3", "d2e2", "h3h2"],
                  evidenceLine: ["h4h3", "d2e2", "h3h2", "e2f3", "h2h1q"],
                  evaluationCpFromSideToMove: 99_988,
                }
              : null,
        ),
      )}
    />,
  );
  fireEvent.click(screen.getByRole("gridcell", { name: /White king on e2/ }));
  fireEvent.click(screen.getByRole("gridcell", { name: /Empty d2/ }));
  expect(
    await screen.findByText("What were you trying to do with Kd2?"),
  ).toBeVisible();
  expect(
    screen.getByRole("gridcell", { name: /Black pawn on h4/ }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next move" }));
  expect(
    screen.getByRole("button", { name: "Original · Kd2", pressed: true }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  for (let step = 0; step < 5; step++) {
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
  }
  expect(
    screen.getByRole("gridcell", { name: /Black queen on h1/ }),
  ).toBeVisible();
});

test("keeps the mistake warning in the chat after the reply is shown or found", async () => {
  const fen = "8/8/8/8/3k3p/8/P3K3/8 w - - 0 1";
  const move = new Chess(fen).move("Kd2");
  const warning = "You played Kd2. Black has a forced mate.";
  const analyzeReply = withBestMoveReplies((position: string) =>
    Promise.resolve(
      position === fen
        ? { line: ["e2f3"], evaluationCpFromSideToMove: 0 }
        : position === move.after
          ? {
              line: ["h4h3", "d2e2", "h3h2"],
              evaluationCpFromSideToMove: 99_988,
            }
          : null,
    ),
  );
  const playKd2 = async () => {
    fireEvent.click(screen.getByRole("gridcell", { name: /White king on e2/ }));
    fireEvent.click(screen.getByRole("gridcell", { name: /Empty d2/ }));
    await screen.findByText("What were you trying to do with Kd2?");
  };

  const view = render(
    <RookExploration
      fen={fen}
      orientation="white"
      puzzle={{ onMove: () => false, source: null }}
      analyzeReply={analyzeReply}
    />,
  );
  await playKd2();
  fireEvent.click(screen.getByRole("button", { name: "Next move" }));
  expect(
    within(screen.getByRole("log")).getByText((text) =>
      text.startsWith(warning + " I played h3."),
    ),
  ).toBeVisible();

  view.unmount();
  render(
    <RookExploration
      fen={fen}
      orientation="white"
      puzzle={{ onMove: () => false, source: null }}
      analyzeReply={analyzeReply}
    />,
  );
  await playKd2();
  fireEvent.click(screen.getByRole("gridcell", { name: /Black pawn on h4/ }));
  fireEvent.click(screen.getByRole("gridcell", { name: /Empty h3/ }));
  expect(
    await within(screen.getByRole("log")).findByText((text) =>
      text.startsWith(warning + " You found it."),
    ),
  ).toBeVisible();
});

test("plays the stronger line after a miss and connects the sacrifice to the queen capture", async () => {
  const fen = "r3kqr1/p4p1Q/2p1pnp1/1p2P3/3R2p1/P7/1PP2P1P/1K2R3 w q - 0 23";
  const missed = new Chess(fen).move("Qh4");
  render(
    <RookExploration
      fen={fen}
      orientation="white"
      puzzle={{ onMove: () => false, source: null }}
      analyzeReply={withBestMoveReplies(
        (position, _signal, _compare, purpose) =>
          Promise.resolve(
            position === fen
              ? {
                  line: ["e5f6"],
                  ...(purpose === "explanation" && {
                    evidenceLine: [
                      "e5f6",
                      "a8d8",
                      "e1e6",
                      "f7e6",
                      "f6f7",
                      "f8f7",
                      "d4d8",
                      "e8d8",
                      "h7f7",
                    ],
                  }),
                  evaluationCpFromSideToMove: 670,
                }
              : position === missed.after
                ? { line: ["f6d5"], evaluationCpFromSideToMove: 480 }
                : null,
          ),
      )}
    />,
  );
  const square = (name: RegExp) => screen.getByRole("gridcell", { name });
  fireEvent.click(square(/White queen on h7/));
  fireEvent.click(square(/Empty h4/));
  fireEvent.click(await screen.findByRole("button", { name: "Next move" }));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  fireEvent.click(screen.getByRole("button", { name: "Show stronger line" }));
  expect(
    await screen.findByRole("gridcell", { name: /White pawn on f6/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("group", { name: "Rook’s line explanation" }),
  ).toHaveTextContent(/Black’s queen went to f7 to answer the check/);
  for (let index = 1; index < 9; index++) {
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
  }
  const log = screen.getByRole("log");
  expect(
    within(log).getByText(/^fxe6\. The capture clears f7 for White’s pawn\.$/),
  ).toBeVisible();
  expect(
    within(log).getByText(/White checks first, then takes the queen on f7/),
  ).toBeVisible();
  expect(
    within(log)
      .getAllByText(/Black’s queen went to f7 to answer the check/)
      .at(-1),
  ).toBeVisible();
  expect(square(/White queen on f7/)).toBeVisible();
  expect(
    screen.queryByText("Good move", { exact: true }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Rewind" }));
  expect(square(/White queen on h7/)).toBeVisible();
});

test("lets a learner request a deeper check after a puzzle miss without an alert", async () => {
  const board = new Chess();
  const fen = board.fen();
  const miss = board.move("a3");
  render(
    <RookExploration
      fen={fen}
      orientation="white"
      puzzle={{ source: null, onMove: () => false }}
      analyzeReply={withBestMoveReplies(
        (position, _signal, _compare, purpose) =>
          Promise.resolve(
            position === fen
              ? {
                  line: ["e2e4"],
                  evaluationCpFromSideToMove:
                    purpose === "explanation" ? 240 : 20,
                }
              : position === miss.after
                ? { line: ["e7e5"], evaluationCpFromSideToMove: 20 }
                : null,
          ),
      )}
    />,
  );

  fireEvent.click(screen.getByRole("gridcell", { name: /White pawn on a2/ }));
  fireEvent.click(screen.getByRole("gridcell", { name: /Empty a3/ }));
  const why = await screen.findByRole("button", {
    name: "Check for a stronger move",
  });
  expect(screen.queryByText(/Find Black’s reply/)).not.toBeInTheDocument();
  fireEvent.click(why);
  expect(
    await screen.findByRole("gridcell", { name: /White pawn on e4/ }),
  ).toBeVisible();
});

test("gives a Practice clue for Black’s move and again for White’s weak reply", async () => {
  const fen = "6k1/8/8/8/8/q7/1P6/6K1 b - - 0 1";
  const board = new Chess(fen);
  const mistake = board.move("Kg7");
  const weakReply = board.move("b3");
  render(
    <RookExploration
      fen={fen}
      orientation="black"
      puzzle={{ onMove: () => false, source: null }}
      analyzeReply={withBestMoveReplies((position) =>
        Promise.resolve(
          position === fen
            ? { line: ["a3e3"], evaluationCpFromSideToMove: 820 }
            : position === mistake.after
              ? { line: ["b2a3"], evaluationCpFromSideToMove: 100 }
              : position === weakReply.after
                ? { line: ["a3b3"], evaluationCpFromSideToMove: 800 }
                : null,
        ),
      )}
    />,
  );
  fireEvent.click(screen.getByRole("gridcell", { name: /Black king on g8/ }));
  fireEvent.click(screen.getByRole("gridcell", { name: /Empty g7/ }));
  expect(
    await screen.findByText("What were you trying to do with Kg7?"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("gridcell", { name: /White pawn on b2/ }));
  fireEvent.click(screen.getByRole("gridcell", { name: /Empty b3/ }));
  expect(
    await screen.findByText(
      "Black can take the pawn on b3. Try another reply.",
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("gridcell", { name: /White pawn on b2/ }),
  ).toBeVisible();
});

test.each([
  ["8", "Black can attack your king and rook with one move."],
  ["6P1", "Your king can be put in check."],
])(
  "warns before a fork only when the attacker cannot immediately be taken (%s)",
  async (pawnRank, clue) => {
    const fen = `6k1/8/8/8/3n4/8/${pawnRank}/3R2K1 w - - 0 1`;
    const mistake = new Chess(fen).move("Rd2");
    render(
      <RookExploration
        fen={fen}
        orientation="white"
        puzzle={{ onMove: () => false, source: null }}
        analyzeReply={withBestMoveReplies((position) =>
          Promise.resolve(
            position === fen
              ? { line: ["g1f1"], evaluationCpFromSideToMove: 200 }
              : position === mistake.after
                ? { line: ["d4f3"], evaluationCpFromSideToMove: 120 }
                : null,
          ),
        )}
      />,
    );
    fireEvent.click(screen.getByRole("gridcell", { name: /White rook on d1/ }));
    fireEvent.click(screen.getByRole("gridcell", { name: /Empty d2/ }));
    expect(
      await screen.findByText("What were you trying to do with Rd2?"),
    ).toBeVisible();
    expect(
      screen.getByRole("gridcell", { name: /Black knight on d4/ }),
    ).toBeVisible();
    expect(screen.queryByText(/Nf3/)).not.toBeInTheDocument();
    expect(screen.queryByText(clue)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));
    expect(
      within(screen.getByRole("log")).getByText((text) =>
        text.startsWith(`You played Rd2. ${clue} I played Nf3`),
      ),
    ).toBeVisible();
  },
);

const promotionRace = {
  fen: "8/8/8/8/3k3p/8/P3K3/8 w - - 0 1",
  analyzeReply: withBestMoveReplies((position) => {
    const fen = "8/8/8/8/3k3p/8/P3K3/8 w - - 0 1";
    const after = new Chess(fen).move("Kd2").after;
    return Promise.resolve(
      position === fen
        ? { line: ["e2f3"], evaluationCpFromSideToMove: 0 }
        : position === after
          ? { line: ["h4h3", "d2e2", "h3h2"], evaluationCpFromSideToMove: 900 }
          : null,
    );
  }),
};

async function playKd2() {
  render(
    <RookExploration
      fen={promotionRace.fen}
      orientation="white"
      puzzle={{ onMove: () => false, source: null }}
      analyzeReply={promotionRace.analyzeReply}
    />,
  );
  fireEvent.click(screen.getByRole("gridcell", { name: /White king on e2/ }));
  fireEvent.click(screen.getByRole("gridcell", { name: /Empty d2/ }));
  await screen.findByText("What were you trying to do with Kd2?");
}

test("shows the checked reply once the learner says what they intended", async () => {
  await playKd2();
  fireEvent.change(screen.getByRole("textbox", { name: "Ask Rook" }), {
    target: { value: "I wanted to stop the pawn" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
  const log = within(screen.getByRole("log"));
  expect(await log.findByText("I wanted to stop the pawn")).toBeVisible();
  expect(
    await log.findByText(
      (text) =>
        text.startsWith("You played Kd2. ") && text.includes("I played h3."),
    ),
  ).toBeVisible();
});

test("points at the threat first, then shows the reply, after a mistake", async () => {
  await playKd2();
  fireEvent.click(screen.getByRole("button", { name: "Hint" }));
  expect(screen.queryByText(/I played h3/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "More hint" }));
  expect(
    await within(screen.getByRole("log")).findByText(
      (text) =>
        text.startsWith("You played Kd2. ") && text.includes("I played h3."),
    ),
  ).toBeVisible();
});

test("takes a statement naming a square as the answer to Rook's question", async () => {
  await playKd2();
  fireEvent.change(screen.getByRole("textbox", { name: "Ask Rook" }), {
    target: { value: "keep the king near d2" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
  const log = within(screen.getByRole("log"));
  expect(
    await log.findByText((text) => text.startsWith("You played Kd2. ")),
  ).toBeVisible();
  expect(screen.queryByText(/^Pieces attacking d2/)).toBeNull();
});
