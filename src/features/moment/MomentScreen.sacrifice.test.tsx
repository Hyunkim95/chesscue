import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type {
  AnalysisCandidate,
  AnalysisEngine,
} from "../../application/analyze-game/analysis-engine";
import { checkTry } from "../../application/run-moment/check-try";
import { ok } from "../../shared/result/result";
import { MomentScreen, type MomentSpec } from "./MomentScreen";

afterEach(cleanup);

// Lichess qAmdmtgs (KPI case 24): the Greek gift. Stockfish's main line
// declines with Kh8; the point is what happens after Kxh7.
const FEN = "1r3rk1/1b1n1ppp/pqpNp3/1p1nP3/3P4/Q2B1N2/P4PPP/2RR2K1 w - - 3 18";
const MOMENT: MomentSpec = {
  id: "greek-gift",
  fen: FEN,
  bestUci: "d3h7",
  bestCp: 920,
  solutionLine: ["d3h7", "g8h8", "f3g5"],
  sourceLabel: "Your game vs Ahmed · Tuesday",
  goal: { kind: "material", prompt: "There's an attack here." },
  ideaName: "Greek gift",
  unitId: "king-attack",
  source: { kind: "game", gameId: "g", ply: 1 },
};

const candidate = (line: readonly string[]): AnalysisCandidate => ({
  uci: line[0] ?? "",
  evaluationCpFromSideToMove: 0,
  principalVariation: line,
  depth: 14,
});

// Rook declines the bishop in the main line.
const engine: AnalysisEngine = {
  initialize: () => Promise.resolve(ok(undefined)),
  analyze: () => Promise.resolve(ok({ candidates: [candidate(["g8h8"])] })),
  dispose: () => undefined,
};

const square = (name: string) =>
  screen.getByRole("gridcell", { name: new RegExp(`^${name}`) });
const bubble = () =>
  screen.getByText(
    (_, node) => node?.classList.contains("rook-bubble__text") ?? false,
  );

it("plays the take-back line of a sacrifice and outlines the mate square", async () => {
  const asked: string[] = [];
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
      analyzePosition={(fen) => {
        asked.push(fen);
        // After Kxh7: White's attack with Ng5+ and Qh3.
        return Promise.resolve(
          ok({
            candidates: [
              fen.startsWith("1r3r2/1b1n1ppk")
                ? candidate(["f3g5", "h7g8", "a3h3"])
                : candidate(["f7f5"]),
            ],
          }),
        );
      }}
      askRook={() => Promise.resolve({ kind: "unrouted" })}
      onComplete={() => undefined}
      onContinue={() => undefined}
    />,
  );
  fireEvent.click(square("White bishop on d3"));
  fireEvent.click(square("Black pawn on h7"));
  const why = await screen.findByRole("button", { name: "Why does it work?" });
  // The take-back line is searched once the position is solved.
  await waitFor(() => {
    expect(asked.some((fen) => fen.startsWith("1r3r2/1b1n1ppk"))).toBe(true);
  });
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(why);
  expect(bubble()).toHaveTextContent(
    "Bxh7+ takes a pawn with check. If Black takes the bishop, Ng5+ and Qh3 threaten mate on h7.",
  );
  for (let step = 0; step < 4; step += 1)
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
  expect(bubble()).toHaveTextContent("Qh3 threatens Qh7#.");
  expect(square("Empty h7").className).toContain("outline-coral");
});
