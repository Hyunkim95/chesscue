import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { checkTry } from "../../application/run-moment/check-try";
import type { AnalysisEngine } from "../../application/analyze-game/analysis-engine";
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

const engine: AnalysisEngine = {
  initialize: () => Promise.resolve(ok(undefined)),
  analyze: () => Promise.resolve(ok({ candidates: [] })),
  dispose: () => undefined,
};

function renderFork() {
  const analyses: { fen: string; multiPv: number }[] = [];
  render(
    <MomentScreen
      moment={FORK}
      online={false}
      checkMove={(uci, signal) =>
        checkTry({ position: FORK, uci, engine, signal })
      }
      analyzePosition={(fen, multiPv) => {
        analyses.push({ fen, multiPv });
        // Rook's main-line reply first, then the alternative Kg8.
        return Promise.resolve(
          ok({
            candidates: [
              {
                uci: "f7f6",
                evaluationCpFromSideToMove: -700,
                principalVariation: ["f7f6", "g5e6"],
                depth: 14,
              },
              {
                uci: "f7g8",
                evaluationCpFromSideToMove: -720,
                principalVariation: ["f7g8", "g5e6"],
                depth: 14,
              },
            ],
          }),
        );
      }}
      askRook={() => Promise.resolve({ kind: "unrouted" })}
      onComplete={() => undefined}
      onContinue={() => undefined}
    />,
  );
  return analyses;
}

const square = (name: string) =>
  screen.getByRole("gridcell", { name: new RegExp(`^${name}`) });

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
