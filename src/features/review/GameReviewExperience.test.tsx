import { generatedMove, squareLabel } from "../../test/generated-position";
import { cachedReflection } from "../../domain/material/reflection";
import type { ReviewReply } from "../../application/analyze-game/analyze-review-reply";
import type { AnalyzeReply } from "./GuidedMoveFeedback";
import { Chess } from "chess.js";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CompletedGameAnalysis } from "../../application/analyze-game/analyze-completed-game";
import type { ReviewTrainingLog } from "../../domain/analysis/review-training";
import type {
  LearningTheme,
  MoveAnalysisFact,
} from "../../domain/analysis/types";
import {
  createGameId,
  type GameRecord,
  type RecordedMove,
} from "../../domain/game/types";
import type { LessonContentProvider } from "../../infrastructure/ai/lesson-content-provider";
import { ReviewContinuation } from "./ReviewContinuation";
import { GameReviewExperience } from "./GameReviewExperience";

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
  vi.unstubAllGlobals();
  if (originalScroll)
    Object.defineProperty(
      HTMLElement.prototype,
      "scrollIntoView",
      originalScroll,
    );
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

function reviewFixture(theme: LearningTheme = "one-move-threat"): {
  readonly game: GameRecord;
  readonly analysis: CompletedGameAnalysis;
} {
  const chess = new Chess();
  const recordedMoves: RecordedMove[] = [];
  const uciMoves = ["e2e4", "e7e5", "g1f3", "b8c6"];
  const fensBefore: string[] = [];
  for (const [index, uci] of uciMoves.entries()) {
    fensBefore.push(chess.fen());
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    recordedMoves.push({
      ply: index + 1,
      san: move.san,
      uci,
      fenAfter: move.after,
      playedAt: "2026-11-24T12:00:00.000Z",
    });
  }

  const gameId = createGameId("review-fixture");
  const fact: MoveAnalysisFact = {
    schemaVersion: 1,
    gameId,
    ply: 3,
    fenBefore: fensBefore[2] ?? "",
    playedMoveUci: "g1f3",
    playedMoveSan: "Nf3",
    evaluationBeforeCp: 25,
    evaluationAfterCp: -135,
    impactCp: 160,
    phase: "opening",
    theme,
    recurrence: 1,
    curricularRelevance: 70,
    candidates: [
      {
        uci: "d2d4",
        san: "d4",
        evaluationCp: 25,
        principalVariation: ["d2d4", "e5d4", "d1d4"],
      },
      {
        uci: "b1c3",
        san: "Nc3",
        evaluationCp: 5,
        principalVariation: ["b1c3", "g8f6"],
      },
    ],
    analysisVersion: "stockfish-19-lite@1",
  };
  return {
    game: {
      schemaVersion: 1,
      id: gameId,
      origin: { type: "tutor" },
      initialFen: new Chess().fen(),
      moves: recordedMoves,
      pgn: chess.pgn(),
      playerColor: "white",
      result: "white-win",
      createdAt: "2026-11-24T12:00:00.000Z",
      completedAt: "2026-11-24T12:10:00.000Z",
      curriculumVersion: "1.0.0",
      configurationVersion: "1.0.0",
      fingerprint: null,
    },
    analysis: {
      facts: [fact],
      analyzedPlayerMoves: 1,
      moments: [
        {
          id: `${gameId}:3:${theme}`,
          gameId,
          ply: 3,
          fenBefore: fact.fenBefore,
          playedMoveUci: fact.playedMoveUci,
          playedMoveSan: fact.playedMoveSan,
          candidateMoveUci: "d2d4",
          candidateMoveSan: "d4",
          impactCp: fact.impactCp,
          theme,
          phase: fact.phase,
          analysisVersion: fact.analysisVersion,
          trace: {
            evaluationBeforeCp: fact.evaluationBeforeCp,
            evaluationAfterCp: fact.evaluationAfterCp,
            recurrence: fact.recurrence,
            curricularRelevance: fact.curricularRelevance,
          },
        },
      ],
    },
  };
}

// Answers Stockfish checks for White's moves from the turning point, keyed by
// the position each move reaches.
function scoredReplies(
  { game }: ReturnType<typeof reviewFixture>,
  scores: Readonly<Record<string, number>>,
  // White's score at the turning point itself, with d4 as the best move.
  start?: number,
): AnalyzeReply {
  const turningPoint = game.moves[1]?.fenAfter ?? game.initialFen;
  const byPosition = new Map(
    Object.entries(scores).map(([san, score]) => {
      const board = new Chess(turningPoint);
      board.move(san);
      return [board.fen(), score];
    }),
  );
  return vi.fn<AnalyzeReply>((fen) => {
    if (fen === turningPoint && start !== undefined)
      return Promise.resolve({
        line: ["d2d4"],
        evaluationCpFromSideToMove: start,
      });
    const score = byPosition.get(fen);
    return Promise.resolve(
      score === undefined
        ? null
        : { line: ["b8c6"], evaluationCpFromSideToMove: score },
    );
  });
}

const playBoardMove = (fromLabel: RegExp, toLabel: RegExp): void => {
  const explore = screen.queryByRole("button", {
    name: "Explore the turning point",
  });
  if (explore) fireEvent.click(explore);
  const board = screen.getByRole("grid", {
    name: "Training board, White side",
  });
  fireEvent.click(within(board).getByRole("gridcell", { name: fromLabel }));
  fireEvent.click(within(board).getByRole("gridcell", { name: toLabel }));
  const commit = screen.queryByRole("button", { name: "Play this move" });
  if (commit !== null) fireEvent.click(commit);
};

const playOriginalBest = (): void => {
  playBoardMove(/White pawn on d2/, /Empty d4, legal destination/);
};

describe("GameReviewExperience transfer set", () => {
  it("replays recorded moves on the same board and hands over before the critical move", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    vi.useFakeTimers();
    try {
      const analyzeReply = vi.fn<AnalyzeReply>();
      render(
        <GameReviewExperience
          {...reviewFixture()}
          compact
          analyzeReply={analyzeReply}
        />,
      );
      const board = screen.getByRole("grid", {
        name: "Training board, White side",
      });
      const d2 = within(board).getByRole("gridcell", {
        name: /White pawn on d2/,
      });
      const challenge = screen.queryByText(
        "You missed a better move here. Can you find it?",
      );
      expect(challenge).not.toBeInTheDocument();
      expect(d2).toBeDisabled();
      expect(
        within(board).getByRole("gridcell", { name: /White pawn on e2/ }),
      ).toBeVisible();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(450);
      });
      expect(
        within(board).getByRole("gridcell", { name: /White pawn on e4/ }),
      ).toBeVisible();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(450);
      });
      expect(
        within(board).getByRole("gridcell", { name: /Black pawn on e5/ }),
      ).toBeVisible();
      expect(
        within(board).getByRole("gridcell", { name: /White knight on g1/ }),
      ).toBeVisible();
      expect(d2).toBeEnabled();
      expect(
        screen.getByText("You missed a better move here. Can you find it?"),
      ).toBeVisible();
      const d4 = within(board).getByRole("gridcell", { name: "Empty d4" });
      expect(d4).not.toHaveAccessibleName(/legal destination/);
      fireEvent.click(d2);
      expect(d4).toHaveAccessibleName(/legal destination/);
      expect(
        screen.queryByRole("button", { name: "Skip replay" }),
      ).not.toBeInTheDocument();
      expect(analyzeReply).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("skips the opening playback and immediately enables the critical position", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    try {
      render(
        <GameReviewExperience
          {...reviewFixture()}
          compact
          analyzeReply={vi.fn<AnalyzeReply>()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Skip replay" }));
      expect(
        screen.getByRole("gridcell", { name: /Black pawn on e5/ }),
      ).toBeEnabled();
      expect(
        screen.getByRole("gridcell", { name: /White knight on g1/ }),
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "Skip replay" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("opens the critical position directly with reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    try {
      render(
        <GameReviewExperience
          {...reviewFixture()}
          compact
          analyzeReply={vi.fn<AnalyzeReply>()}
        />,
      );
      expect(
        screen.getByRole("gridcell", { name: /Black pawn on e5/ }),
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "Skip replay" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("says when a move beats the game move but still trails the best move", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const fixture = reviewFixture();
    // Scores from Black's side after each White move.
    const analyzeReply = scoredReplies(fixture, {
      Nf3: 135,
      Bc4: 0,
      d4: -400,
    });
    render(
      <GameReviewExperience {...fixture} compact analyzeReply={analyzeReply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip replay" }));
    const board = within(
      screen.getByRole("grid", { name: "Training board, White side" }),
    );
    fireEvent.click(
      board.getByRole("gridcell", { name: /White bishop on f1/ }),
    );
    fireEvent.click(board.getByRole("gridcell", { name: /Empty c4/ }));
    await screen.findByText(
      "Bc4 beats your game move Nf3, but d4 keeps more of your advantage. Try another move.",
    );
    expect(screen.queryByText("You found a better move.")).toBeNull();
    // The undone try stays marked on the board until the next move.
    expect(
      screen
        .getByRole("grid", { name: "Training board, White side" })
        .querySelector('[data-move-cue-arrow="f1:c4"]'),
    ).toBeInTheDocument();
    expect(
      board.getByRole("gridcell", { name: /White bishop on f1/ }),
    ).toBeEnabled();
  });

  it("answers statements at the turning point and asks about a try when the player asks why", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const fixture = reviewFixture();
    const analyzeReply = scoredReplies(
      fixture,
      { Nf3: 135, Bc4: 0, d4: -400 },
      400,
    );
    render(
      <GameReviewExperience {...fixture} compact analyzeReply={analyzeReply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip replay" }));
    const board = within(
      screen.getByRole("grid", { name: "Training board, White side" }),
    );
    fireEvent.click(
      board.getByRole("gridcell", { name: /White bishop on f1/ }),
    );
    fireEvent.click(board.getByRole("gridcell", { name: /Empty c4/ }));
    await screen.findByText(/^Bc4 beats your game move Nf3/);
    const chat = screen.getByRole("textbox", { name: "Ask Rook" });
    fireEvent.change(chat, { target: { value: "move the bishop to c4" } });
    fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
    expect(
      await screen.findByText(
        "Play the move you have in mind on the board and I’ll check it.",
      ),
    ).toBeVisible();

    fireEvent.change(chat, { target: { value: "why?" } });
    fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
    await screen.findByText("What were you trying to do with Bc4?");
    fireEvent.change(chat, { target: { value: "develop the bishop to c4" } });
    fireEvent.click(screen.getByRole("button", { name: /^Ask$/ }));
    expect(
      await within(screen.getByRole("log")).findByText((text) =>
        text.startsWith("You played Bc4. "),
      ),
    ).toBeVisible();
  });

  it("keeps the board ready after a close or weaker move and confirms a clear improvement", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const fixture = reviewFixture();
    const analyzeReply = scoredReplies(fixture, {
      Nf3: 135,
      Nc3: 100,
      a3: 180,
      d4: 99,
    });
    render(
      <GameReviewExperience {...fixture} compact analyzeReply={analyzeReply} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip replay" }));
    const trainingBoard = screen.getByRole("grid", {
      name: "Training board, White side",
    });
    const board = within(trainingBoard);
    fireEvent.click(
      board.getByRole("gridcell", { name: /White knight on b1/ }),
    );
    fireEvent.click(board.getByRole("gridcell", { name: /Empty c3/ }));
    await screen.findByText(
      "Nc3 is close to your game move Nf3. Try another move.",
    );
    expect(
      board.getByRole("gridcell", { name: /White knight on b1/ }),
    ).toBeEnabled();

    fireEvent.click(board.getByRole("gridcell", { name: /White pawn on a2/ }));
    fireEvent.click(board.getByRole("gridcell", { name: /Empty a3/ }));
    await screen.findByText(
      "a3 is weaker than your game move Nf3. Try another move.",
    );
    expect(
      board.getByRole("gridcell", { name: /White pawn on a2/ }),
    ).toBeEnabled();

    fireEvent.click(board.getByRole("gridcell", { name: /White pawn on d2/ }));
    fireEvent.click(board.getByRole("gridcell", { name: /Empty d4/ }));
    await screen.findByText("You found a better move.");
    const explanation = within(screen.getByRole("log")).getByText(
      /0\.36-point edge over Nf3/,
    );
    expect(explanation).toHaveTextContent(
      "The pawn takes space in the center on d4.",
    );
    expect(explanation).toHaveTextContent("The knight develops from g1 to f3.");
    expect(
      board.getByRole("gridcell", { name: /White pawn on d4/ }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Compare moves" }));
    const comparison = within(
      screen.getByRole("group", { name: "Move comparison" }),
    );
    expect(
      comparison.getByRole("button", { name: "Better · d4" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(comparison.getByText("+ d4 only")).toBeVisible();
    expect(comparison.getByText("− Nf3 only")).toBeVisible();
    const c5 = board.getByRole("gridcell", {
      name: /Empty c5.*control gained by the better move/,
    });
    fireEvent.click(c5);
    expect(c5).toHaveAttribute("aria-selected", "true");
    expect(
      trainingBoard.querySelector('[data-control-arrow="d4:c5"]'),
    ).toBeInTheDocument();
    expect(
      trainingBoard.querySelector('[data-control-arrow="f8:c5"]'),
    ).toBeInTheDocument();
    const inspection = within(
      screen.getByRole("status", { name: "Square control" }),
    );
    expect(inspection.getByText("Control of c5")).toBeVisible();
    expect(
      inspection.getByRole("img", { name: "White pawn on d4" }),
    ).toBeVisible();
    expect(
      inspection.getAllByRole("img", { name: "Black bishop on f8" }),
    ).toHaveLength(2);
    expect(
      board.getByRole("gridcell", { name: /White pawn on d4.*controls c5/ }),
    ).toBeVisible();
    expect(
      board.getByRole("gridcell", { name: /Black bishop on f8.*controls c5/ }),
    ).toBeVisible();
    expect(
      board.getByRole("gridcell", { name: "Black pawn on e5" }),
    ).toBeDisabled();
    expect(
      board.getAllByRole("gridcell", { name: /control gained/ }),
    ).toHaveLength(5);
    expect(
      board.getAllByRole("gridcell", { name: /control lost/ }),
    ).toHaveLength(1);
    expect(
      board.queryAllByRole("gridcell", { name: /last move ended here/ }),
    ).toHaveLength(0);
    expect(
      board.getByRole("gridcell", { name: /Black knight on b8/ }),
    ).toBeVisible();
    fireEvent.click(comparison.getByRole("button", { name: "Original · Nf3" }));
    expect(
      board.getByRole("gridcell", { name: /White knight on f3/ }),
    ).toBeVisible();
    expect(c5).toHaveAttribute("aria-selected", "true");
    expect(
      trainingBoard.querySelector('[data-control-arrow="d4:c5"]'),
    ).not.toBeInTheDocument();
    expect(
      trainingBoard.querySelector('[data-control-arrow="f8:c5"]'),
    ).toBeInTheDocument();
    expect(inspection.getByText("Control of c5")).toBeVisible();
    expect(
      board.getByRole("gridcell", { name: /Black bishop on f8.*controls c5/ }),
    ).toBeVisible();
    expect(
      board.queryByRole("gridcell", { name: /White.*controls c5/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      board.getByRole("gridcell", {
        name: /Empty h4.*control lost by the better move/,
      }),
    );
    expect(inspection.getByText("Control of h4")).toBeVisible();
    expect(
      board.getByRole("gridcell", { name: /White knight on f3.*controls h4/ }),
    ).toBeVisible();
    expect(
      board.getAllByRole("gridcell", { name: /control gained/ }),
    ).toHaveLength(5);
    expect(
      board.getAllByRole("gridcell", { name: /control lost/ }),
    ).toHaveLength(1);
    fireEvent.click(comparison.getByRole("button", { name: "Better · d4" }));
    expect(
      board.getByRole("gridcell", { name: /White pawn on d4/ }),
    ).toBeVisible();
    fireEvent.click(comparison.getByRole("button", { name: "Done" }));
    expect(
      screen.queryByRole("status", { name: "Square control" }),
    ).not.toBeInTheDocument();
    expect(
      board.getByRole("gridcell", { name: /Black knight on c6/ }),
    ).toBeEnabled();
    expect(
      trainingBoard.querySelector("[data-control-arrow]"),
    ).not.toBeInTheDocument();
    // Nf3 is checked once; d4's position is scored for each weaker try.
    expect(analyzeReply).toHaveBeenCalledTimes(6);
  });

  it("does not call a close opening evaluation a missed opportunity", () => {
    const { game, analysis } = reviewFixture();
    const [fact] = analysis.facts;
    if (!fact) throw new Error("Missing review fact.");
    render(
      <GameReviewExperience
        game={game}
        analysis={{
          ...analysis,
          facts: [{ ...fact, evaluationAfterCp: 5, impactCp: 20 }],
        }}
        compact
        analyzeReply={vi.fn<AnalyzeReply>()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip replay" }));
    expect(
      screen.queryByText("You missed a better move here. Can you find it?"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("gridcell", { name: /Black pawn on e5/ }),
    ).toBeEnabled();
  });

  it("shows the debrief before opening the critical position without revealing the engine move", () => {
    render(<GameReviewExperience {...reviewFixture()} />);
    expect(screen.getByRole("heading", { name: "Game debrief" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Turning point" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Explore the turning point" }),
    );
    expect(
      screen.getByRole("region", { name: "Rook commentary" }),
    ).toHaveTextContent("In your game you played Nf3 here.");
    expect(screen.getByText("Your move")).toBeVisible();
    expect(screen.queryByText("d2d4")).not.toBeInTheDocument();
  });

  it("switches findings and reveals the recorded reply on one board", () => {
    const fixture = reviewFixture();
    const [turningPoint] = fixture.analysis.facts;
    if (!turningPoint) throw new Error("Missing turning point fixture.");
    const strongMove = {
      ...turningPoint,
      ply: 1,
      fenBefore: fixture.game.initialFen,
      playedMoveUci: "e2e4",
      playedMoveSan: "e4",
      evaluationBeforeCp: 25,
      evaluationAfterCp: 25,
      impactCp: 0,
      candidates: [
        {
          uci: "e2e4",
          san: "e4",
          evaluationCp: 25,
          principalVariation: ["e2e4"],
        },
      ],
    };
    render(
      <GameReviewExperience
        {...fixture}
        analysis={{
          ...fixture.analysis,
          facts: [strongMove, turningPoint],
        }}
      />,
    );
    const board = screen.getByRole("grid", {
      name: "Review board, White side",
    });
    expect(
      within(board).getByRole("gridcell", { name: /White knight on f3/ }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show the reply" }));
    expect(
      within(board).getByRole("gridcell", {
        name: /Black knight on c6, last move ended here/,
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Strong move" }));
    expect(screen.getByRole("button", { name: "Strong move" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(board).getByRole("gridcell", {
        name: /White pawn on e4, last move ended here/,
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Turning point" }));
    expect(
      within(board).getByRole("gridcell", { name: /Black knight on b8/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Show the reply" }),
    ).toBeVisible();
  });

  it("replies to successive choices outside the recorded line and comments on the board", async () => {
    const analyzeReply = vi
      .fn()
      .mockResolvedValueOnce({ line: ["g8f6"], evaluationCpFromSideToMove: 0 })
      .mockResolvedValueOnce({ line: ["f6e4"], evaluationCpFromSideToMove: 0 });
    render(
      <GameReviewExperience {...reviewFixture()} analyzeReply={analyzeReply} />,
    );
    playBoardMove(/White bishop on f1/, /Empty c4, legal destination/);
    expect(
      await screen.findByRole("gridcell", {
        name: /Black knight on f6, last move ended here/,
      }),
    ).toBeVisible();
    playBoardMove(/White pawn on a2/, /Empty a3, legal destination/);
    expect(
      await screen.findByRole("gridcell", {
        name: /Black knight on e4, last move ended here/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Rook commentary" }),
    ).toHaveTextContent(
      "Your last move left the pawn on e4 under attack. After this capture you have no immediate recapture there. Black is a pawn ahead.",
    );
    expect(analyzeReply).toHaveBeenCalledTimes(2);
  });

  it("retains the position after a bad reply and retries from the same FEN", async () => {
    const analyzeReply = vi
      .fn()
      .mockResolvedValueOnce({ line: ["e1e8"], evaluationCpFromSideToMove: 0 })
      .mockResolvedValueOnce({ line: ["e5d4"], evaluationCpFromSideToMove: 0 });
    render(
      <GameReviewExperience {...reviewFixture()} analyzeReply={analyzeReply} />,
    );
    playOriginalBest();
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry CPU reply" }),
    );
    expect(
      await screen.findByRole("gridcell", {
        name: /Black pawn on d4, last move ended here/,
      }),
    ).toBeVisible();
    expect(analyzeReply.mock.calls[0]?.[0]).toEqual(
      analyzeReply.mock.calls[1]?.[0],
    );
  });

  it.each(["Undo my move", "Rewind again"])(
    "cancels a pending reply and keeps the first attempt when clicking %s",
    async (action) => {
      let answer: (reply: ReviewReply | null) => void = () => undefined;
      const analyzeReply = vi.fn<AnalyzeReply>(
        () =>
          new Promise<ReviewReply | null>((resolve) => {
            answer = resolve;
          }),
      );
      const onTrainingComplete = vi.fn();
      render(
        <GameReviewExperience
          {...reviewFixture()}
          analyzeReply={analyzeReply}
          onTrainingComplete={onTrainingComplete}
        />,
      );
      playOriginalBest();
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(analyzeReply.mock.calls[0]?.[1].aborted).toBe(true);
      answer({ line: ["e5d4"], evaluationCpFromSideToMove: 0 });
      await Promise.resolve();
      expect(
        within(screen.getByRole("grid", { name: /Training board/ })).getByRole(
          "gridcell",
          { name: /White pawn on d2/ },
        ),
      ).toBeVisible();
      playBoardMove(/White pawn on a2/, /Empty a3, legal destination/);
      fireEvent.click(screen.getByRole("button", { name: "Finish review" }));
      expect(onTrainingComplete).toHaveBeenCalledWith(
        expect.objectContaining({ originalAttemptScore: 100 }),
      );
      expect(analyzeReply.mock.calls[1]?.[1].aborted).toBe(true);
    },
  );

  it("brings back the queen-check choices after taking back the learner’s reply", async () => {
    const position = new Chess();
    for (const move of [
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bb5",
      "a6",
      "Bxc6",
      "dxc6",
      "Nxe5",
      "Qd4",
    ])
      position.move(move);
    const analyzeReply = vi
      .fn<AnalyzeReply>()
      .mockResolvedValueOnce({
        line: ["d4e4", "d1e2", "e4e2"],
        evaluationCpFromSideToMove: 58,
      })
      .mockResolvedValueOnce({
        line: ["e4e2", "e1e2"],
        evaluationCpFromSideToMove: 60,
      });
    render(
      <ReviewContinuation
        game={{
          ...reviewFixture().game,
          initialFen: position.fen(),
          moves: [],
        }}
        ply={1}
        analyzeReply={analyzeReply}
        onFirstMove={vi.fn()}
      >
        {null}
      </ReviewContinuation>,
    );
    playBoardMove(/White knight on e5/, /Empty f3, legal destination/);
    const commentary = within(
      screen.getByRole("region", { name: "Rook commentary" }),
    );
    expect(
      await commentary.findByText("You have 2 legal replies to this check."),
    ).toBeVisible();
    expect(
      commentary.getByText(/Qxe2\+ Kxe2, you lose castling rights/),
    ).toBeVisible();
    expect(
      commentary.getByText(/moving your king gives up castling/),
    ).toBeVisible();
    playBoardMove(/White queen on d1/, /Empty e2, legal destination/);
    await screen.findByRole("gridcell", {
      name: /Black queen on e2, last move ended here/,
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo my move" }));
    expect(
      commentary.getByText("You have 2 legal replies to this check."),
    ).toBeVisible();
    expect(analyzeReply).toHaveBeenCalledTimes(2);
  });

  it("lets Black underpromote and stops on a drawn board without a CPU search", () => {
    const { game } = reviewFixture();
    const analyzeReply = vi.fn();
    const onFirstMove = vi.fn();
    render(
      <ReviewContinuation
        game={{
          ...game,
          initialFen: "7K/8/8/8/8/8/p7/7k b - - 0 1",
          moves: [],
          playerColor: "black",
        }}
        ply={1}
        analyzeReply={analyzeReply}
        onFirstMove={onFirstMove}
      >
        {null}
      </ReviewContinuation>,
    );
    const board = within(
      screen.getByRole("grid", { name: "Training board, Black side" }),
    );
    fireEvent.click(board.getByRole("gridcell", { name: "Black pawn on a2" }));
    fireEvent.click(
      board.getByRole("gridcell", { name: /Empty a1, legal destination/ }),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Promote pawn" })).getByRole(
        "button",
        { name: "knight" },
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Draw.");
    expect(
      board.getByRole("gridcell", { name: /Black knight on a1/ }),
    ).toBeDisabled();
    expect(analyzeReply).not.toHaveBeenCalled();
    expect(onFirstMove).toHaveBeenCalledWith("a2a1n");
  });

  it("runs close and unlabeled curated transfers before logging", () => {
    const fixture = reviewFixture();
    const onTrainingComplete = vi.fn<(log: ReviewTrainingLog) => void>();
    render(
      <GameReviewExperience
        {...fixture}
        onTrainingComplete={onTrainingComplete}
        now={() => "2026-11-24T12:00:00.000Z"}
      />,
    );
    playOriginalBest();
    fireEvent.click(
      screen.getByRole("button", { name: "Try a similar position" }),
    );
    expect(
      screen.getByRole("heading", { name: "Spot it again?" }),
    ).toBeVisible();
    {
      const { move } = generatedMove("one-move-threat", "close", true);
      playBoardMove(squareLabel(move.from), squareLabel(move.to));
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Practice without a hint" }),
    );

    expect(
      screen.getByRole("heading", { name: "One more position?" }),
    ).toBeVisible();
    expect(screen.queryByText(/one-move threat/i)).not.toBeInTheDocument();
    {
      const { move } = generatedMove("one-move-threat", "unlabeled", true);
      playBoardMove(squareLabel(move.from), squareLabel(move.to));
    }
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));

    expect(
      screen.getByRole("heading", {
        name: "Take one cue into the next game",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/tested the idea in 2 new positions/),
    ).toBeVisible();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
    expect(onTrainingComplete).toHaveBeenCalledOnce();
  });

  it("lets the learner undo an incorrect similar-position move", () => {
    const fixture = reviewFixture();
    render(<GameReviewExperience {...fixture} />);
    playOriginalBest();
    fireEvent.click(
      screen.getByRole("button", { name: "Try a similar position" }),
    );
    {
      const { move } = generatedMove("one-move-threat", "close", false);
      playBoardMove(squareLabel(move.from), squareLabel(move.to));
    }

    expect(screen.getByText("Try another move")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Practice without a hint" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo and try again" }));
    expect(
      screen.getByRole("heading", { name: "Spot it again?" }),
    ).toBeVisible();
  });

  it("schedules both transfers when the curated pack does not support the theme", () => {
    const fixture = reviewFixture("calculation");
    render(
      <GameReviewExperience
        {...fixture}
        now={() => "2026-11-24T12:00:00.000Z"}
      />,
    );
    playOriginalBest();
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));

    expect(screen.getByText(cachedReflection("calculation"))).toBeVisible();
  });

  it("navigates every saved position on the debrief board and keeps technical details secondary", () => {
    render(<GameReviewExperience {...reviewFixture()} />);
    expect(screen.queryByText("Technical details")).not.toBeInTheDocument();
    const controls = screen.getByRole("group", { name: "Replay controls" });
    const seek = within(controls).getByRole("slider", {
      name: "Move through the game",
    });
    fireEvent.change(seek, { target: { value: "0" } });
    expect(
      within(controls).getByRole("button", { name: "Previous move" }),
    ).toBeDisabled();
    fireEvent.click(
      within(controls).getByRole("button", { name: "Next move" }),
    );
    expect(screen.getByText(/Position 1 of/)).toBeVisible();
    expect(
      screen.getAllByRole("grid", { name: "Review board, White side" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("gridcell", {
        name: /White pawn on e4, last move ended here/,
      }),
    ).toBeVisible();
    fireEvent.change(seek, { target: { value: "4" } });
    expect(
      within(controls).getByRole("button", { name: "Next move" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Turning point$/ }));
    playOriginalBest();
    expect(
      screen.getByText("Technical details").closest("details"),
    ).not.toHaveAttribute("open");
  });

  it("lets the learner stop after the rewound game without taking a quiz", () => {
    const fixture = reviewFixture();
    const onTrainingComplete = vi.fn<(log: ReviewTrainingLog) => void>();
    render(
      <GameReviewExperience
        {...fixture}
        onTrainingComplete={onTrainingComplete}
        now={() => "2026-11-24T12:00:00.000Z"}
      />,
    );
    playOriginalBest();

    expect(screen.getByRole("button", { name: "Finish review" })).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish review" }));

    expect(screen.getByText(/replayed the critical moment/)).toBeVisible();
    expect(onTrainingComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        closeTransferScore: null,
        unlabeledTransferScore: null,
      }),
    );
  });

  it("shows the opponent reply in an optional similar position", () => {
    const fixture = reviewFixture("development");
    render(<GameReviewExperience {...fixture} />);
    playOriginalBest();
    fireEvent.click(
      screen.getByRole("button", { name: "Try a similar position" }),
    );
    {
      const { move } = generatedMove("development", "close", true);
      playBoardMove(squareLabel(move.from), squareLabel(move.to));
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Show Stockfish move" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Play their reply" }));

    expect(screen.getByText(/Move 2 of/)).toBeVisible();
  });

  it("calls Firebase hybrid coaching after a user gesture and shows provenance", async () => {
    const fixture = reviewFixture("development");
    const initializeDeviceModel = vi.fn(() => Promise.resolve());
    const provider: LessonContentProvider = {
      initializeDeviceModel,
      generate: () =>
        Promise.resolve({
          provenance: "on-device",
          value: {
            stepId: "explain-attempt",
            prompt: "What improved?",
            correctFeedback:
              "That move improves coordination before the position opens.",
            incorrectFeedback: "Try another move.",
            referencedMoves: [],
            referencedSquares: [],
            referencedNumbers: [],
          },
        }),
    };
    render(<GameReviewExperience {...fixture} coachProvider={provider} />);
    playOriginalBest();

    expect(initializeDeviceModel).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Why this matters"));
    expect(await screen.findByText(/What improved\?$/)).toBeVisible();
    expect(
      screen.getByText("Feedback source: Gemini Nano on device"),
    ).toBeVisible();
  });
});
