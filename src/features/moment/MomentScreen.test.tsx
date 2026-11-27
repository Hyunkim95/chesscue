import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { checkTry } from "../../application/run-moment/check-try";
import type {
  AnalysisCandidate,
  AnalysisEngine,
} from "../../application/analyze-game/analysis-engine";
import type { QuestionOutcome } from "../../application/route-question/route-question";
import { ok } from "../../shared/result/result";
import { MomentScreen, type MomentSpec } from "./MomentScreen";

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
) {
  const analyses: { fen: string; multiPv: number }[] = [];
  render(
    <MomentScreen
      moment={FORK}
      online={false}
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
              fen === AFTER_FORK
                ? [
                    candidate("f7f6", -700, ["f7f6", "g5e6"]),
                    candidate("f7g8", -720, ["f7g8", "g5e6"]),
                  ]
                : [candidate("g5e6", 900)],
          }),
        );
      }}
      askRook={askRook}
      onComplete={() => undefined}
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
  expect(screen.getByText("e4 adds control of d5 and f5.")).toBeVisible();
  next();
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
  expect(stepper).toHaveTextContent("1 / 4");
  expect(bubble()).toHaveTextContent(/^Nxg5\+ takes my pawn/);
  expect(screen.getByRole("button", { name: "Previous step" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  // The board stays on the first frame until the player steps.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(stepper).toHaveTextContent("1 / 4");

  next();
  expect(stepper).toHaveTextContent("2 / 4");
  expect(square("Black king on f6")).toBeVisible();
  fireEvent.keyDown(stepper, { key: "ArrowRight" });
  expect(bubble()).toHaveTextContent(/^Nxe6 takes my queen/);
  fireEvent.keyDown(stepper, { key: "ArrowRight" });
  expect(bubble()).toHaveTextContent("You've won a queen and a pawn.");
  expect(screen.getByRole("button", { name: "Next step" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  fireEvent.keyDown(stepper, { key: "ArrowLeft" });
  expect(stepper).toHaveTextContent("3 / 4");

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
  expect(stepper).toHaveTextContent("1 / 4");
  next();
  expect(bubble()).toHaveTextContent("I take your bishop with Rbxc5.");
  next();
  expect(bubble()).toHaveTextContent("I win your bishop.");
  expect(square("Black rook on c5").className).toContain("outline-coral");
  next();
  expect(bubble()).toHaveTextContent("Nxe6 instead wins the queen.");

  fireEvent.click(screen.getByRole("button", { name: "◀ Back to the answer" }));
  expect(stepper).toHaveTextContent("2 / 4");
  expect(square("Black king on f6")).toBeVisible();
  // The line's own move steps on.
  fireEvent.click(square("White knight on g5"));
  fireEvent.click(square("Black queen on e6"));
  expect(
    screen.getByRole("group", { name: "Step through the line" }),
  ).toHaveTextContent("3 / 4");
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
  expect(bubble()).toHaveTextContent("I keep my queen.");
  expect(square("Black queen on e6").className).toContain("outline-coral");
  expect(stepper).toHaveTextContent("3 / 3");
  // Nothing names or draws the answer before it is found.
  expect(document.body).not.toHaveTextContent(/Ng5|Nxg5/);
  expect(document.querySelector("[data-move-cue-arrow='f3:g5']")).toBeNull();
});

it("answers a typed question about a move in the line on the frame it was played", async () => {
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
  // Offline, Rook confirms before acting.
  fireEvent.click(await screen.findByRole("button", { name: "Why Kf6?" }));
  expect(asked[0]?.boardMoveSan).toBe("Kf6");
  expect(asked[0]?.fen).toMatch(/^2r5\/8\/4Nk2/);
  expect(bubble()).toHaveTextContent("Kf6 gets my king out of check.");
  expect(
    screen.getByRole("group", { name: "Step through the line" }),
  ).toHaveTextContent("2 / 4");
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
  expect(steps).toHaveTextContent("3 / 4");
  const before = screen
    .getAllByRole("gridcell")
    .map((cell) => cell.getAttribute("aria-label"));

  const input = screen.getByRole("textbox", { name: "Ask Rook" });
  fireEvent.change(input, { target: { value: "why would the knight take" } });
  const form = input.closest("form");
  if (!form) throw new Error("The ask bar has no form");
  fireEvent.submit(form);

  const offer = await screen.findByRole("button", {
    name: "Show it on the board",
  });
  expect(steps).toHaveTextContent("3 / 4");
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
