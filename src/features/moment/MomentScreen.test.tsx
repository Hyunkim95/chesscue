import { Chess } from "chess.js";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { checkTry } from "../../application/run-moment/check-try";
import type {
  AnalysisCandidate,
  AnalysisEngine,
} from "../../application/analyze-game/analysis-engine";
import type { QuestionOutcome } from "../../application/route-question/route-question";
import type { VoiceContext } from "../../application/route-question/question-router";
import type { WhyInput } from "../../domain/analysis/why-packet";
import { ok } from "../../shared/result/result";
import { MomentScreen, type MomentSpec } from "./MomentScreen";

// Voice: the speech hook is replaced so a test can "say" something.
const speech = vi.hoisted(() => {
  const state: { onMessage: (text: string) => void; listens: number } = {
    onMessage: () => undefined,
    listens: 0,
  };
  return state;
});
vi.mock("../../shared/rook/use-rook-speech", () => ({
  useRookSpeech: (onMessage: (text: string) => void) => {
    speech.onMessage = onMessage;
    return {
      state: { status: "idle" },
      start: () => {
        speech.listens += 1;
        return Promise.resolve();
      },
      cancel: () => undefined,
      stop: () => undefined,
    };
  },
}));

afterEach(cleanup);

// Lichess puzzle 0Uxzm: Nxg5+ forks the king and queen.
const FORK: MomentSpec = {
  id: "fork",
  fen: "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35",
  bestUci: "f3g5",
  bestCp: 723,
  solutionLine: ["f3g5", "f7f6", "g5e6"],
  sourceLabel: "Your game vs Ahmed · Tuesday",
  goal: { kind: "material", prompt: "One move here wins material." },
  ideaName: "Attack two targets",
  unitId: "double-attack",
  source: { kind: "game", gameId: "g", ply: 1 },
};
// After 35. Nxg5+, where Rook has a choice of defences.
const AFTER_FORK = "2r5/5k2/4q3/1rBp2N1/p2P1p2/PpR1P1Pp/1P2KP1P/2R5 b - - 0 35";
const afterMiss = new Chess(FORK.fen);
afterMiss.move("gxf4");
afterMiss.move("gxf4");
const AFTER_MISS = afterMiss.fen();

const candidate = (
  uci: string,
  evaluationCpFromSideToMove: number,
  principalVariation: readonly string[] = [uci],
): AnalysisCandidate => ({
  uci,
  evaluationCpFromSideToMove,
  principalVariation,
  depth: 14,
});

// Stockfish's answer to any move it is asked about: Rook takes the bishop
// on c5 when he can, or the pawn on f4.
const engine: AnalysisEngine = {
  initialize: () => Promise.resolve(ok(undefined)),
  analyze: ({ fen }) =>
    Promise.resolve(
      ok({
        candidates: [
          fen.startsWith("2r5/8/4qk2")
            ? candidate("b5c5", 300)
            : candidate("g5f4", 50),
        ],
      }),
    ),
  dispose: () => undefined,
};

function renderFork(
  askRook: (question: {
    text: string;
    fen: string;
    boardMoveUci?: string | undefined;
    boardMoveSan?: string | undefined;
  }) => Promise<QuestionOutcome> = () => Promise.resolve({ kind: "unrouted" }),
  {
    online = false,
    explainWhy,
    routeVoice,
    trackProgress = true,
    onComplete = () => undefined,
  }: {
    readonly online?: boolean;
    readonly trackProgress?: boolean;
    readonly onComplete?: () => void;
    readonly explainWhy?: (input: WhyInput) => Promise<string | undefined>;
    readonly routeVoice?: (
      context: VoiceContext,
      signal: AbortSignal,
    ) => Promise<string | undefined>;
  } = {},
) {
  const analyses: { fen: string; multiPv: number }[] = [];
  render(
    <MomentScreen
      moment={FORK}
      online={online}
      explainWhy={explainWhy}
      {...(routeVoice ? { routeVoice } : {})}
      checkMove={(uci, signal) =>
        checkTry({ position: FORK, uci, engine, signal })
      }
      checkFrom={(position, uci, signal) =>
        checkTry({ position, uci, engine, signal })
      }
      analyzePosition={(fen, multiPv) => {
        analyses.push({ fen, multiPv });
        // Rook's main-line reply first, then the alternative Kg8; anywhere
        // else, the line's own move is best.
        return Promise.resolve(
          ok({
            candidates:
              fen === AFTER_MISS
                ? [candidate("f3g5", 900, ["f3g5", "f7f6"])]
                : fen === AFTER_FORK
                  ? [
                      candidate("f7f6", -700, ["f7f6", "g5e6"]),
                      candidate("f7g8", -720, ["f7g8", "g5e6"]),
                    ]
                  : [candidate("g5e6", 900)],
          }),
        );
      }}
      askRook={askRook}
      trackProgress={trackProgress}
      onComplete={onComplete}
      onContinue={() => undefined}
    />,
  );
  return analyses;
}

const square = (name: string) =>
  screen.getByRole("gridcell", { name: new RegExp(`^${name}`) });
const bubble = () =>
  screen.getByText(
    (_, node) => node?.classList.contains("rook-bubble__text") ?? false,
  );
const next = () => {
  fireEvent.click(screen.getByRole("button", { name: "Next step" }));
};

async function solveFork() {
  fireEvent.click(square("White knight on f3"));
  fireEvent.click(square("Black pawn on g5"));
  await screen.findByRole("button", { name: "Done ✓" });
}

it("lets an alternate-side review finish without awarding progress", async () => {
  const onComplete = vi.fn();
  renderFork(undefined, { trackProgress: false, onComplete });
  await solveFork();
  fireEvent.click(screen.getByRole("button", { name: "Done ✓" }));

  expect(
    await screen.findByRole("dialog", { name: /You spotted it/ }),
  ).toBeVisible();
  expect(screen.queryByText(/XP|Added to your collection/)).toBeNull();
  expect(onComplete).not.toHaveBeenCalled();
});

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PLAN: MomentSpec = {
  ...FORK,
  id: "plan",
  fen: START,
  bestUci: "g1f3",
  bestCp: 28,
  solutionLine: ["g1f3", "g8f6"],
  toleranceCp: 75,
  goal: {
    kind: "plan",
    prompt: "Fight for the centre.",
    arrows: [],
    outlines: [
      { square: "d4", tone: "jade" },
      { square: "e4", tone: "jade" },
    ],
  },
};

it("marks a plan's goal on the board and replays the player's own good move", async () => {
  // Stockfish rates e4 within the plan tolerance and answers e5.
  const good: AnalysisEngine = {
    ...engine,
    analyze: () =>
      Promise.resolve(ok({ candidates: [candidate("e7e5", -20)] })),
  };
  render(
    <MomentScreen
      moment={PLAN}
      online={false}
      checkMove={(uci, signal) =>
        checkTry({ position: PLAN, uci, engine: good, signal })
      }
      checkFrom={(position, uci, signal) =>
        checkTry({ position, uci, engine: good, signal })
      }
      analyzePosition={() => Promise.resolve(ok({ candidates: [] }))}
      askRook={() => Promise.resolve({ kind: "unrouted" })}
      onComplete={() => undefined}
      onContinue={() => undefined}
    />,
  );
  expect(screen.getByText("Fight for the centre.")).toBeVisible();
  expect(square("Empty d4").className).toContain("outline-jade");
  fireEvent.click(square("White pawn on e2"));
  // Selecting a piece keeps the goal marked.
  expect(square("Empty e4").className).toContain("outline-jade");
  fireEvent.click(square("Empty e4"));
  fireEvent.click(
    await screen.findByRole("button", { name: "Why does it work?" }),
  );
  // The player's own move and Rook's answer to it, not Rook's main line.
  // A quiet line is one frame, then Rook's own move.
  expect(bubble()).toHaveTextContent(
    "e4 adds control of d5 and f5. No tactic here, just a useful move.",
  );
  next();
  expect(
    screen.getByText("Nf3 works too. It also covers d4 and e5."),
  ).toBeVisible();
});

it("offers Rook's other defence after solving and plays it from the solved position", async () => {
  const analyses = renderFork();
  fireEvent.click(square("White knight on f3"));
  fireEvent.click(square("Black pawn on g5"));
  const chip = await screen.findByRole("button", {
    name: "What if you'd played Kg8?",
  });
  expect(analyses[0]?.multiPv).toBe(2);
  fireEvent.click(chip);
  await waitFor(() => {
    expect(screen.getByText("I answer Kg8.")).toBeVisible();
  });
  expect(screen.getByRole("button", { name: "↺ Reset" })).toBeVisible();
});

it("steps through the line only when the player steps, by button or arrow key", async () => {
  renderFork();
  await solveFork();
  fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
  const stepper = screen.getByRole("group", { name: "Step through the line" });
  expect(stepper).toHaveTextContent("Step 1 of 3Goal: the queen on e6");
  // The queen the point wins is the goal: outlined in brass and tagged.
  expect(square("Black queen on e6").className).toContain("outline-brass");
  expect(square("Black queen on e6")).toHaveTextContent("GOAL");
  // The point is said on the first move's frame.
  expect(bubble()).toHaveTextContent(/^Nxg5\+ wins a queen/);
  expect(screen.getByRole("button", { name: "Previous step" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  // The board stays on the first frame until the player steps.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(stepper).toHaveTextContent("Step 1 of 3");

  next();
  expect(stepper).toHaveTextContent("Step 2 of 3");
  expect(square("Black king on f6")).toBeVisible();
  fireEvent.keyDown(stepper, { key: "ArrowRight" });
  expect(bubble()).toHaveTextContent(/^Nxe6 takes my queen/);
  fireEvent.keyDown(stepper, { key: "ArrowRight" });
  // The king takes the knight back on e6, so it counts.
  expect(bubble()).toHaveTextContent(
    "You've won a queen and a pawn for a knight.",
  );
  expect(screen.getByRole("button", { name: "Next step" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.keyDown(stepper, { key: "ArrowLeft" });
  expect(stepper).toHaveTextContent("Step 3 of 3");

  fireEvent.click(screen.getByRole("button", { name: "↺ Reset" }));
  expect(square("White knight on f3")).toBeVisible();
  expect(
    screen.queryByRole("group", { name: "Step through the line" }),
  ).toBeNull();
});

it("lets the player try another move at their turn and shows why it is not as good", async () => {
  renderFork();
  await solveFork();
  fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
  next();
  // After Kf6 it is the player's turn: Nf3 instead of Nxe6.
  fireEvent.click(square("White knight on g5"));
  fireEvent.click(square("Empty f3"));
  // Rook's refutation opens on the player's own move.
  const stepper = screen.getByRole("group", { name: "Step through the line" });
  expect(
    await screen.findByText("Nf3 adds control of d4 and e5."),
  ).toBeVisible();
  expect(stepper).toHaveTextContent("Step 1 of 2");
  next();
  expect(bubble()).toHaveTextContent("I take your bishop with Rbxc5.");
  next();
  // dxc5 would win the rook back, so Rook claims no material: only that the
  // try lets his queen escape.
  expect(bubble()).toHaveTextContent(
    "You missed a chance to win my queen. Try again.",
  );
  next();
  expect(bubble()).toHaveTextContent("Nxe6 instead wins the queen.");

  fireEvent.click(screen.getByRole("button", { name: "◀ Back to the answer" }));
  expect(stepper).toHaveTextContent("Step 2 of 3");
  expect(square("Black king on f6")).toBeVisible();
  // The line's own move steps on.
  fireEvent.click(square("White knight on g5"));
  fireEvent.click(square("Black queen on e6"));
  expect(
    screen.getByRole("group", { name: "Step through the line" }),
  ).toHaveTextContent("Step 3 of 3");
});

it.each(["board", "question"])(
  "answers a follow-up and lets the learner continue by %s without scoring another try",
  async (method) => {
    const askRook = vi.fn(() => Promise.resolve({ kind: "unrouted" } as const));
    renderFork(askRook);
    fireEvent.click(square("White pawn on g3"));
    fireEvent.click(square("Black pawn on f4"));
    await screen.findByRole("button", { name: "↺ Try again" });

    const input = screen.getByRole("textbox", { name: "Ask Rook" });
    fireEvent.change(input, {
      target: { value: "What are you threatening now?" },
    });
    fireEvent.submit(input);
    expect(bubble()).toHaveTextContent(/If it were my move/);
    expect(askRook).not.toHaveBeenCalled();

    if (method === "board") {
      fireEvent.click(square("White knight on f3"));
      fireEvent.click(square("Empty g5"));
    } else {
      fireEvent.change(input, { target: { value: "What if I play Ng5+?" } });
      fireEvent.submit(input);
    }
    expect(await screen.findByText(/Best move\. Ng5\+/)).toBeVisible();
    expect(
      screen.getByRole("list", { name: "Your tries" }).children,
    ).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Done ✓" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "◀ Back to the position" }),
    );
    expect(square("White knight on f3")).toBeVisible();
    expect(bubble()).toHaveTextContent("I answer gxf4.");
    fireEvent.click(screen.getByRole("button", { name: "↺ Try again" }));
    expect(
      document.querySelector("[data-move-cue-arrow='g3:f4']"),
    ).toBeInTheDocument();
  },
);

it("draws both targets when Rook's reply forks the king and rook", async () => {
  const moment: MomentSpec = {
    ...FORK,
    fen: "7k/8/8/8/3n4/8/7P/R3K1N1 w - - 0 1",
    bestUci: "e1f2",
    bestCp: 100,
    solutionLine: ["e1f2"],
  };
  const forkReply: AnalysisEngine = {
    ...engine,
    analyze: () =>
      Promise.resolve(ok({ candidates: [candidate("d4c2", 200)] })),
  };
  const askRook = vi.fn(() => Promise.resolve({ kind: "unrouted" } as const));
  render(
    <MomentScreen
      moment={moment}
      online={false}
      checkMove={(uci, signal) =>
        checkTry({ position: moment, uci, engine: forkReply, signal })
      }
      checkFrom={(position, uci, signal) =>
        checkTry({ position, uci, engine: forkReply, signal })
      }
      analyzePosition={() => Promise.resolve(ok({ candidates: [] }))}
      askRook={askRook}
      onComplete={() => undefined}
      onContinue={() => undefined}
    />,
  );
  fireEvent.click(square("White pawn on h2"));
  fireEvent.click(square("Empty h3"));
  await screen.findByRole("button", { name: "↺ Try again" });
  const forkLine = "[data-move-cue-arrow='c2:a1']";
  expect(document.querySelector(forkLine)).toBeInTheDocument();
  expect(
    document.querySelector("[data-move-cue-arrow='c2:e1']"),
  ).toBeInTheDocument();

  const input = screen.getByRole("textbox", { name: "Ask Rook" });
  fireEvent.change(input, { target: { value: "What are you threatening?" } });
  fireEvent.submit(input);
  expect(document.querySelector(forkLine)).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: "Where is the fork?" } });
  fireEvent.submit(input);
  expect(document.querySelector(forkLine)).toBeInTheDocument();
  expect(bubble()).toHaveTextContent(
    /attacking your king on e1 and your rook on a1 at once/,
  );
  expect(askRook).not.toHaveBeenCalled();
});

it("asks why not the player's try and shows what it costs without the answer", async () => {
  renderFork();
  fireEvent.click(square("White pawn on g3"));
  fireEvent.click(square("Black pawn on f4"));
  const chip = await screen.findByRole("button", { name: "Why not gxf4?" });
  fireEvent.click(chip);
  const stepper = screen.getByRole("group", { name: "Step through the line" });
  expect(bubble()).toHaveTextContent(/^gxf4 takes my pawn/);
  next();
  expect(bubble()).toHaveTextContent("I take your pawn with gxf4.");
  next();
  expect(bubble()).toHaveTextContent(
    "That's safe, but you missed a chance to win my queen. Try again.",
  );
  expect(square("Black queen on e6").className).toContain("outline-coral");
  expect(stepper).toHaveTextContent("Result");
  // Nothing names or draws the answer before it is found.
  expect(document.body).not.toHaveTextContent(/Ng5|Nxg5/);
  expect(document.querySelector("[data-move-cue-arrow='f3:g5']")).toBeNull();
});

it("answers a typed why about a move in the line by code, staying on the frame", async () => {
  const asked: { fen: string; boardMoveSan?: string | undefined }[] = [];
  renderFork((question) => {
    asked.push(question);
    return Promise.resolve(
      question.boardMoveUci
        ? {
            kind: "confirm",
            action: { kind: "why", uci: question.boardMoveUci },
            label: `Why ${question.boardMoveSan ?? ""}?`,
            understood: "Gemini Nano understood · why",
          }
        : { kind: "unrouted" },
    );
  });
  await solveFork();
  fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
  next();
  next();
  const input = screen.getByRole("textbox", { name: "Ask Rook" });
  fireEvent.change(input, { target: { value: "why Kf6?" } });
  const form = input.closest("form");
  if (!form) throw new Error("The ask bar has no form");
  fireEvent.submit(form);
  // A "why" naming a move in the line is answered by code on that move,
  // without the router and without leaving the frame.
  expect(
    await screen.findByText("Kf6 gets my king out of check."),
  ).toBeVisible();
  expect(asked).toEqual([]);
  expect(
    screen.getByRole("group", { name: "Step through the line" }),
  ).toHaveTextContent("Step 3 of 3");
});

it("answers a typed question in place and only moves the board when asked", async () => {
  // Online, the router acts at once; a question still never moves the board.
  renderFork((question) =>
    Promise.resolve(
      question.boardMoveUci
        ? {
            kind: "act",
            action: { kind: "why", uci: question.boardMoveUci },
            understood: "Gemini Flash understood · why",
          }
        : { kind: "unrouted" },
    ),
  );
  await solveFork();
  fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
  next();
  next();
  const steps = screen.getByRole("group", { name: "Step through the line" });
  expect(steps).toHaveTextContent("Step 3 of 3");
  const before = screen
    .getAllByRole("gridcell")
    .map((cell) => cell.getAttribute("aria-label"));

  const input = screen.getByRole("textbox", { name: "Ask Rook" });
  // Asked about a move from another step: answered here, with a button.
  fireEvent.change(input, { target: { value: "explain Kf6" } });
  const form = input.closest("form");
  if (!form) throw new Error("The ask bar has no form");
  fireEvent.submit(form);

  const offer = await screen.findByRole("button", {
    name: "Show it on the board",
  });
  expect(steps).toHaveTextContent("Step 3 of 3");
  expect(
    screen
      .getAllByRole("gridcell")
      .map((cell) => cell.getAttribute("aria-label")),
  ).toEqual(before);
  expect(bubble()).not.toHaveTextContent("Let me think");
  fireEvent.click(offer);
  expect(
    screen.queryByRole("button", { name: "Show it on the board" }),
  ).toBeNull();
});

it("never plays the answer from a loosely worded question while solving", async () => {
  renderFork(() =>
    Promise.resolve({
      kind: "act",
      action: { kind: "show-me" },
      understood: "Gemini Flash understood · show",
    }),
  );
  const before = screen
    .getAllByRole("gridcell")
    .map((cell) => cell.getAttribute("aria-label"));
  const input = screen.getByRole("textbox", { name: "Ask Rook" });
  fireEvent.change(input, { target: { value: "why would queen take" } });
  const form = input.closest("form");
  if (!form) throw new Error("The ask bar has no form");
  fireEvent.submit(form);
  await screen.findByRole("button", { name: "Show me the answer" });
  expect(
    screen
      .getAllByRole("gridcell")
      .map((cell) => cell.getAttribute("aria-label")),
  ).toEqual(before);
  expect(screen.queryByRole("button", { name: "Done ✓" })).toBeNull();
});

it("answers a routed why at once, without asking Did you mean", async () => {
  // Offline, the device router asks for confirmation; a why is answered
  // straight away because answering never moves the board.
  renderFork((question) =>
    Promise.resolve(
      question.boardMoveUci
        ? {
            kind: "confirm",
            action: { kind: "why", uci: question.boardMoveUci },
            label: `Why ${question.boardMoveSan ?? ""}?`,
            understood: "Gemini Nano understood · why",
          }
        : { kind: "unrouted" },
    ),
  );
  await solveFork();
  fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
  next();
  const steps = screen.getByRole("group", { name: "Step through the line" });
  const at = steps.textContent;
  const input = screen.getByRole("textbox", { name: "Ask Rook" });
  fireEvent.change(input, { target: { value: "that move, what was it for" } });
  const form = input.closest("form");
  if (!form) throw new Error("The ask bar has no form");
  fireEvent.submit(form);
  await screen.findByText("Kf6 gets my king out of check.");
  expect(screen.queryByText(/Did you mean/)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Show it on the board" }),
  ).toBeNull();
  expect(steps.textContent).toBe(at);
});

it("offers the game's opening only after the position is solved", async () => {
  const good: AnalysisEngine = {
    ...engine,
    analyze: () =>
      Promise.resolve(
        ok({
          candidates: [
            {
              uci: "e7e5",
              evaluationCpFromSideToMove: -20,
              principalVariation: ["e7e5"],
              depth: 14,
            },
          ],
        }),
      ),
  };
  render(
    <MomentScreen
      moment={PLAN}
      online={false}
      checkMove={(uci, signal) =>
        checkTry({ position: PLAN, uci, engine: good, signal })
      }
      checkFrom={(position, uci, signal) =>
        checkTry({ position, uci, engine: good, signal })
      }
      analyzePosition={() => Promise.resolve(ok({ candidates: [] }))}
      askRook={() => Promise.resolve({ kind: "unrouted" })}
      onComplete={() => undefined}
      onContinue={() => undefined}
      openingFrames={[
        {
          fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
          moveUci: "e7e5",
          by: "learner",
          arrows: [{ from: "g1", to: "f3", kind: "move" }],
          outlines: [],
          control: [],
          caption: "You left the book with h3. The usual move is Nf3.",
        },
      ]}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "About this opening" }),
  ).toBeNull();
  fireEvent.click(square("White pawn on e2"));
  fireEvent.click(square("Empty e4"));
  fireEvent.click(
    await screen.findByRole("button", { name: "About this opening" }),
  );
  expect(
    screen.getByText("You left the book with h3. The usual move is Nf3."),
  ).toBeVisible();
});

it("hands-free reads each line aloud, listens, and steps on when told to move", async () => {
  const spoken: { text: string; onend: (() => void) | null }[] = [];
  class Utterance {
    lang = "";
    voice: unknown = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public readonly text: string) {}
  }
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [],
    cancel: () => undefined,
    speak: (utterance: Utterance) => spoken.push(utterance),
  });
  try {
    renderFork();
    await solveFork();
    fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
    const steps = screen.getByRole("group", { name: "Step through the line" });
    expect(steps).toHaveTextContent("Step 1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Hands-free voice" }));
    const line = spoken.at(-1);
    expect(line?.text).toBe(bubble().textContent);
    const before = speech.listens;
    line?.onend?.();
    expect(speech.listens).toBe(before + 1);
    act(() => {
      speech.onMessage("Move.");
    });
    expect(steps).toHaveTextContent("Step 2 of 3");
    expect(spoken.at(-1)?.text).toBe(bubble().textContent);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("hands-free asks for a move, checks legality, and uses the same controls as taps", async () => {
  const askRook = vi.fn<() => Promise<QuestionOutcome>>(() =>
    Promise.resolve({ kind: "unrouted" }),
  );
  renderFork(askRook);
  fireEvent.click(screen.getByRole("button", { name: "Hands-free voice" }));

  act(() => {
    speech.onMessage("Move.");
  });
  expect(bubble()).toHaveTextContent("Which move?");
  act(() => {
    speech.onMessage("Move knight to a eight.");
  });
  expect(bubble()).toHaveTextContent("couldn’t match that move");
  expect(screen.queryByLabelText("Your tries")).toBeNull();

  act(() => {
    speech.onMessage("Move knight to g five.");
  });
  const why = await screen.findByRole("button", { name: "Why does it work?" });
  await waitFor(() => {
    expect(why).toBeEnabled();
    expect(why).not.toHaveAttribute("aria-disabled", "true");
  });
  expect(square("White knight on g5")).toBeVisible();

  act(() => {
    speech.onMessage("Why does it work?");
  });
  expect(
    screen.getByRole("group", { name: "Step through the line" }),
  ).toHaveTextContent("Step 1 of 3");
  expect(askRook).not.toHaveBeenCalled();
});

it("routes paraphrased speech against available controls and confirms inferred moves", async () => {
  const routeVoice = vi.fn(async ({ text, controls, moves }: VoiceContext) => {
    await Promise.resolve();
    if (text === "Put my horse somewhere better") {
      expect(moves).toEqual([]);
      return "clarify-move";
    }
    if (text === "Set my horse down on g five")
      return moves.find(({ uci }) => uci === "f3g5")?.id;
    if (text === "Yep, that's the one")
      return controls.find(({ label }) => label.startsWith("Play Nxg5"))?.id;
    return controls.find(({ label }) => label === "Why does it work?")?.id;
  });
  renderFork(undefined, { routeVoice });
  fireEvent.click(screen.getByRole("button", { name: "Hands-free voice" }));
  await act(() => {
    speech.onMessage("Put my horse somewhere better");
    return Promise.resolve();
  });
  expect(bubble()).toHaveTextContent("Which move?");
  expect(screen.queryByRole("button", { name: /Play Nxg5/ })).toBeNull();
  await act(() => {
    speech.onMessage("Set my horse down on g five");
    return Promise.resolve();
  });
  expect(screen.getByRole("button", { name: /Play Nxg5/ })).toBeEnabled();
  expect(square("White knight on f3")).toBeVisible();

  await act(() => {
    speech.onMessage("Yep, that's the one");
    return Promise.resolve();
  });
  expect(
    screen.getByRole("button", { name: "Why does it work?" }),
  ).toBeEnabled();
  expect(square("White knight on g5")).toBeVisible();
  await act(() => {
    speech.onMessage("Walk me through what made that good");
    return Promise.resolve();
  });
  expect(
    screen.getByRole("group", { name: "Step through the line" }),
  ).toHaveTextContent("Step 1 of 3");
});

it("discards a voice decision when the player changes the screen while routing", async () => {
  let resolveChoice: ((choice: string | undefined) => void) | undefined;
  const response = new Promise<string | undefined>((resolve) => {
    resolveChoice = resolve;
  });
  const routeVoice = vi.fn((context: VoiceContext, signal: AbortSignal) => {
    expect(context.controls.some(({ label }) => label === "Show me")).toBe(
      true,
    );
    expect(signal.aborted).toBe(false);
    return response;
  });
  renderFork(undefined, { routeVoice });
  fireEvent.click(screen.getByRole("button", { name: "Hands-free voice" }));
  act(() => {
    speech.onMessage("Go ahead and show how it's done");
  });
  const call = routeVoice.mock.calls[0];
  fireEvent.click(screen.getByRole("button", { name: "Hint" }));
  expect(call?.[1].aborted).toBe(true);
  await act(async () => {
    resolveChoice?.(
      call?.[0].controls.find(({ label }) => label === "Show me")?.id,
    );
    await response;
  });
  expect(
    screen.queryByRole("group", { name: "Step through the line" }),
  ).toBeNull();
});

const WHY =
  "Nxg5+ attacks your king and your queen on e6 at once, so after you move the king I take the queen.";

it("says why the move works in the writer's checked words online", async () => {
  const explainWhy = vi.fn<(input: WhyInput) => Promise<string | undefined>>(
    () => Promise.resolve(WHY),
  );
  renderFork(undefined, { online: true, explainWhy });
  await solveFork();
  await waitFor(() => {
    expect(explainWhy).toHaveBeenCalledTimes(1);
  });
  expect(explainWhy.mock.calls[0]?.[0]).toMatchObject({
    fen: FORK.fen,
    bestLine: FORK.solutionLine,
  });
  fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
  await waitFor(() => {
    expect(bubble()).toHaveTextContent(WHY);
  });
  // The board still shows the point's frame, stepped one at a time.
  expect(
    screen.getByRole("group", { name: "Step through the line" }),
  ).toHaveTextContent("Step 1 of 3");
});

it("swaps in a late why while the opening frame is still shown", async () => {
  let answer: (text: string | undefined) => void = () => undefined;
  const explainWhy = () =>
    new Promise<string | undefined>((resolve) => {
      answer = resolve;
    });
  renderFork(undefined, { online: true, explainWhy });
  await solveFork();
  fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
  expect(bubble()).toHaveTextContent(/^Nxg5\+ wins a queen/);
  act(() => {
    answer(WHY);
  });
  await waitFor(() => {
    expect(bubble()).toHaveTextContent(WHY);
  });
});

it("keeps the code caption when the why is not written", async () => {
  renderFork(undefined, {
    online: true,
    explainWhy: () => Promise.resolve(undefined),
  });
  await solveFork();
  fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(bubble()).toHaveTextContent(/^Nxg5\+ wins a queen/);
});

it("never asks for a written why offline", async () => {
  const explainWhy = vi.fn(() => Promise.resolve<string | undefined>(WHY));
  renderFork(undefined, { explainWhy });
  await solveFork();
  fireEvent.click(screen.getByRole("button", { name: "Why does it work?" }));
  expect(bubble()).toHaveTextContent(/^Nxg5\+ wins a queen/);
  expect(explainWhy).not.toHaveBeenCalled();
});
