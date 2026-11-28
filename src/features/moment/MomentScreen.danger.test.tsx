import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { AnalysisEngine } from "../../application/analyze-game/analysis-engine";
import { pickHint } from "../../application/route-question/pick-hint";
import { readDanger } from "../../application/route-question/read-danger";
import type { QuestionRouter } from "../../application/route-question/question-router";
import { checkTry } from "../../application/run-moment/check-try";
import { dangerMoment } from "../../domain/session/spot-danger";
import type { MomentResult } from "../../domain/session/types";
import { ok } from "../../shared/result/result";
import { MomentScreen, type MomentSpec } from "./MomentScreen";

afterEach(cleanup);

// The approved mock's position: Black to move after White's Nxd4, the queen
// on e6 loose to the knight. In the game Black played Be5.
const FEN = "2kr3r/1pp2pp1/p1nbqn2/3p3p/3N4/1P2P1P1/PBP2PBP/R2QK2R b KQ - 0 13";
const LINE = ["d6b4", "e1f1", "c6d4", "d1d4", "b4d6"];
const danger = dangerMoment({
  fen: FEN,
  solutionLine: LINE,
  lastMove: { uci: "f3d4", san: "Nxd4" },
  gameLine: ["d6e5", "d4c6", "e5b2", "c6d8", "b2a1", "d1a1"],
});
const MOMENT: MomentSpec = {
  id: "danger",
  fen: FEN,
  bestUci: "d6b4",
  bestCp: 37,
  solutionLine: LINE,
  sourceLabel: "Your game vs Ahmed · Tuesday",
  playedInGame: { uci: "d6e5", san: "Be5" },
  goal: {
    kind: "plan",
    prompt: "First, deal with my threat.",
    arrows: [],
    outlines: [],
  },
  ideaName: "Loose queen",
  unitId: "count-captures",
  source: { kind: "game", gameId: "g", ply: 2 },
  danger,
};

// Stockfish answers any move with Kf1.
const engine: AnalysisEngine = {
  initialize: () => Promise.resolve(ok(undefined)),
  analyze: () =>
    Promise.resolve(
      ok({
        candidates: [
          {
            uci: "e1f1",
            evaluationCpFromSideToMove: -37,
            principalVariation: ["e1f1"],
            depth: 14,
          },
        ],
      }),
    ),
  dispose: () => undefined,
};

function renderDanger(
  router?: QuestionRouter,
  complete?: (result: MomentResult) => Promise<void>,
) {
  const results: MomentResult[] = [];
  const askRook = vi.fn(() => Promise.resolve({ kind: "unrouted" } as const));
  render(
    <MomentScreen
      moment={MOMENT}
      online={false}
      checkMove={(uci, signal) =>
        checkTry({ position: MOMENT, uci, engine, signal })
      }
      checkFrom={(position, uci, signal) =>
        checkTry({ position, uci, engine, signal })
      }
      analyzePosition={() => Promise.resolve(ok({ candidates: [] }))}
      askRook={askRook}
      readDanger={
        router
          ? (text, signal) =>
              readDanger({ text, facts: danger?.facts ?? [], router, signal })
          : undefined
      }
      pickHint={
        router
          ? (text, signal) =>
              pickHint({ text, fen: MOMENT.fen, router, signal })
          : undefined
      }
      onComplete={
        complete ??
        ((result) => {
          results.push(result);
        })
      }
      onContinue={() => undefined}
    />,
  );
  return { results, askRook };
}

const square = (name: string) =>
  screen.getByRole("gridcell", { name: new RegExp(`^${name}`) });
const bubble = () =>
  screen.getByText(
    (_, node) => node?.classList.contains("rook-bubble__text") ?? false,
  );
const arrows = () =>
  [...document.querySelectorAll("[data-move-cue-arrow]")].map((node) =>
    node.getAttribute("data-move-cue-arrow"),
  );

it("asks what is in trouble with only the last move marked", () => {
  renderDanger();
  expect(
    screen.getByRole("heading", {
      name: /White just played Nxd4\. Is something of yours in trouble\?/,
    }),
  ).toBeVisible();
  expect(bubble()).toHaveTextContent(
    "Tap the piece you'd worry about. Or tell me what you see.",
  );
  expect(square("White knight on d4").className).toContain("highlighted");
  expect(arrows()).toEqual([]);
  // The threat question would give it away, and so would the move's own why.
  expect(
    screen.queryByRole("button", { name: "What are you threatening?" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Why not Be5?" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Show me" })).toBeNull();
  expect(screen.getByRole("button", { name: "Hint" })).toBeVisible();
  // Without a model on the device, the ask bar keeps its usual prompt.
  expect(screen.getByRole("textbox", { name: "Ask Rook" })).toHaveAttribute(
    "placeholder",
    "Tap a chip, or type and I'll check",
  );
});

it("nudges a partial description and accepts a correct description without a tap", async () => {
  const read = vi
    .fn<QuestionRouter["readDanger"]>()
    .mockResolvedValueOnce("attacked-but-safe:c6")
    .mockResolvedValueOnce("wins-material:e6");
  const { results, askRook } = renderDanger({
    model: "Gemini Nano",
    route: () => Promise.resolve(undefined),
    readDanger: read,
    pickHint: () => Promise.resolve(undefined),
  });
  const input = screen.getByRole("textbox", { name: "Ask Rook" });
  expect(input).toHaveAttribute("placeholder", "Tell Rook what you see…");
  fireEvent.change(input, {
    target: { value: "the knight can take my knight on c6" },
  });
  fireEvent.submit(input);
  await screen.findByText("Gemini Nano understood · knight on c6 attacked");
  expect(bubble()).toHaveTextContent(
    "True, your knight on c6 is attacked. Something bigger is too. Follow the knight's other jumps.",
  );
  // A reading is feedback only: nothing drawn, nothing spotted, no question
  // routed.
  expect(arrows()).toEqual([]);
  expect(askRook).not.toHaveBeenCalled();
  expect(
    screen.getByRole("heading", { name: /Is something of yours in trouble/ }),
  ).toBeVisible();

  fireEvent.change(input, {
    target: { value: "White's knight is threatening my queen on e6" },
  });
  fireEvent.submit(input);
  expect(
    await screen.findByRole("heading", { name: /Spotted it\./ }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Done ✓" })).toBeEnabled();
  expect(results).toEqual([]);
  expect(arrows().toSorted()).toEqual(["d4:c6", "d4:e6"]);
  expect(square("Black queen on e6").className).toContain("outline-coral");
  expect(square("Black knight on c6").className).toContain("outline-coral");
  expect(bubble()).toHaveTextContent(
    "Yes. White threatens Nxe6, winning your queen for a knight. In your game, after Be5, White plays Nxc6, taking your knight on c6.",
  );
  expect(screen.queryByRole("textbox", { name: "Ask Rook" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Find a safe move" }));
  expect(
    screen.getByRole("heading", { name: /Your move\. Keep everything safe\./ }),
  ).toBeVisible();
  expect(bubble()).toHaveTextContent(
    "Play it on the board. I'll answer with White's best reply.",
  );
  expect(arrows()).toEqual([]);
  // The usual loop, still without the threat question.
  expect(screen.getByRole("button", { name: "Show me" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Why not Be5?" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "What are you threatening?" }),
  ).toBeNull();
  fireEvent.click(square("Black bishop on d6"));
  fireEvent.click(square("Empty b4"));
  fireEvent.click(await screen.findByRole("button", { name: "Done ✓" }));
  // Only the safe move counts: first try, no help.
  expect(results).toEqual([
    expect.objectContaining({ outcome: "spotted", helped: false }),
  ]);
});

it("plays what happened in the game as a steppable story", () => {
  renderDanger();
  fireEvent.click(square("Black queen on e6"));
  fireEvent.click(screen.getByRole("button", { name: "Show what happened" }));
  // The game line runs on until no capture is pending, so its length varies.
  expect(screen.getByText(/^1 \/ \d+$/)).toBeVisible();
  expect(bubble()).toHaveTextContent("Be5");
  fireEvent.click(screen.getByRole("button", { name: "Next step" }));
  expect(bubble()).toHaveTextContent("I take your knight with Nxc6.");
  // Reset goes back to the spotted danger, which still hands over.
  fireEvent.click(screen.getByRole("button", { name: "↺ Reset" }));
  expect(arrows().toSorted()).toEqual(["d4:c6", "d4:e6"]);
  expect(
    screen.getByRole("button", { name: "Find a safe move" }),
  ).toBeVisible();
});

it("keeps the tap path when the device cannot read words", async () => {
  renderDanger({
    model: "Gemini Nano",
    route: () => Promise.resolve(undefined),
    readDanger: () => Promise.resolve(undefined),
    pickHint: () => Promise.resolve(undefined),
  });
  const input = screen.getByRole("textbox", { name: "Ask Rook" });
  fireEvent.change(input, { target: { value: "my queen?" } });
  fireEvent.submit(input);
  await waitFor(() => {
    expect(bubble()).toHaveTextContent(
      "Tap the piece you'd worry about and I'll check it.",
    );
  });
  fireEvent.click(square("Black knight on f6"));
  expect(bubble()).toHaveTextContent(
    "Your knight on f6 is safe for now. Something else is in trouble.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Hint" }));
  expect(bubble()).toHaveTextContent(
    "Look at White's knight on d4. What could it do next?",
  );
  expect(square("White knight on d4").className).toContain("outline-coral");
  fireEvent.click(square("Black queen on e6"));
  expect(screen.getByRole("heading", { name: /Spotted it\./ })).toBeVisible();
});

it("gives the hint Gemini Nano picks when the answer misses the danger", async () => {
  renderDanger({
    model: "Gemini Nano",
    route: () => Promise.resolve(undefined),
    readDanger: () => Promise.resolve("none"),
    pickHint: () => Promise.resolve("check-their-threats"),
  });
  const input = screen.getByRole("textbox", { name: "Ask Rook" });
  fireEvent.change(input, { target: { value: "I want to push my h pawn" } });
  fireEvent.submit(input);
  await waitFor(() => {
    expect(bubble()).toHaveTextContent(
      /^Before you attack, check what White threatens\./,
    );
  });
  expect(
    screen.getByText(/Gemini Nano understood · your own plan/),
  ).toBeVisible();
  // The answer didn't identify a threat, so the exercise stays open.
  expect(screen.queryByRole("button", { name: "Find a safe move" })).toBeNull();
});

it("can finish after spotting the threat without playing a safe move", async () => {
  const { results } = renderDanger();
  expect(screen.queryByRole("button", { name: "Done ✓" })).toBeNull();
  fireEvent.click(square("Black queen on e6"));
  expect(results).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "Done ✓" }));
  expect(
    await screen.findByRole("dialog", { name: "Threat spotted" }),
  ).toBeVisible();
  expect(screen.queryByText(/Added to your collection/)).toBeNull();
  expect(results).toEqual([
    { outcome: "spotted", helped: false, explorations: 0, attempts: [] },
  ]);
});

it("keeps the spotted position open if saving fails and lets the player retry", async () => {
  const complete = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("storage unavailable"))
    .mockResolvedValueOnce(undefined);
  renderDanger(undefined, complete);
  fireEvent.click(square("Black queen on e6"));
  fireEvent.click(screen.getByRole("button", { name: "Done ✓" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn’t save this position.",
  );
  expect(screen.queryByRole("dialog", { name: "Threat spotted" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Done ✓" }));
  expect(
    await screen.findByRole("dialog", { name: "Threat spotted" }),
  ).toBeVisible();
  expect(complete).toHaveBeenCalledTimes(2);
});
