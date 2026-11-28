import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type {
  AnalysisCandidate,
  AnalysisEngine,
} from "../../application/analyze-game/analysis-engine";
import { checkTry } from "../../application/run-moment/check-try";
import { ok } from "../../shared/result/result";
import { MomentScreen, type MomentSpec } from "./MomentScreen";

afterEach(cleanup);

// Qxd8+ Kxd8 trades queens; Nf7+ then forks the king and the rook on h8.
const FEN = "r1bqk2r/ppp3pp/8/4N3/8/8/PPP2PPP/3Q2K1 w - - 0 1";
const LINE = ["d1d8", "e8d8", "e5f7", "d8e7", "f7h8"];
const MOMENT: MomentSpec = {
  id: "trade-then-fork",
  fen: FEN,
  bestUci: "d1d8",
  bestCp: 500,
  solutionLine: LINE,
  sourceLabel: "Your game vs Ahmed · Tuesday",
  goal: { kind: "material", prompt: "You can win material here." },
  ideaName: "Fork",
  unitId: "forks",
  source: { kind: "game", gameId: "g", ply: 1 },
};

const candidate = (line: readonly string[]): AnalysisCandidate => ({
  uci: line[0] ?? "",
  evaluationCpFromSideToMove: 0,
  principalVariation: line,
  depth: 14,
});

const engine: AnalysisEngine = {
  initialize: () => Promise.resolve(ok(undefined)),
  analyze: () =>
    Promise.resolve(ok({ candidates: [candidate(LINE.slice(1))] })),
  dispose: () => undefined,
};

const square = (name: string) =>
  screen.getByRole("gridcell", { name: new RegExp(`^${name}`) });
const bubble = () =>
  screen.getByText(
    (_, node) => node?.classList.contains("rook-bubble__text") ?? false,
  );

it("plays a queen trade on to the fork that wins the rook", async () => {
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
      analyzePosition={() =>
        Promise.resolve(ok({ candidates: [candidate(LINE.slice(1))] }))
      }
      askRook={() => Promise.resolve({ kind: "unrouted" })}
      onComplete={() => undefined}
      onContinue={() => undefined}
    />,
  );
  fireEvent.click(square("White queen on d1"));
  fireEvent.click(square("Black queen on d8"));
  fireEvent.click(
    await screen.findByRole("button", { name: "Why does it work?" }),
  );
  expect(bubble()).toHaveTextContent(/^Qxd8\+ wins a rook\./);
  for (let step = 0; step < 5; step += 1)
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
  expect(bubble()).toHaveTextContent("You've won a rook.");
});

it("says so when the player found the same move in the real game", async () => {
  render(
    <MomentScreen
      moment={{
        ...MOMENT,
        playedInGame: { uci: "d1d8", san: "Qxd8+" },
        game: { opponent: "Ahmed", day: "Tuesday" },
      }}
      online={false}
      checkMove={(uci, signal) =>
        checkTry({ position: MOMENT, uci, engine, signal })
      }
      checkFrom={(position, uci, signal) =>
        checkTry({ position, uci, engine, signal })
      }
      analyzePosition={() =>
        Promise.resolve(ok({ candidates: [candidate(LINE.slice(1))] }))
      }
      askRook={() => Promise.resolve({ kind: "unrouted" })}
      onComplete={() => undefined}
      onContinue={() => undefined}
    />,
  );
  fireEvent.click(square("White queen on d1"));
  fireEvent.click(square("Black queen on d8"));
  await screen.findByRole("button", { name: "Why does it work?" });
  expect(bubble()).toHaveTextContent(
    /^You found Qxd8\+ in the game too\. Want to see why it works/,
  );
  fireEvent.click(screen.getByRole("button", { name: "Done ✓" }));
  const sheet = await screen.findByRole("dialog");
  expect(sheet).toHaveTextContent("Fork · played it in a real game");
  expect(sheet).toHaveTextContent(
    "You found Qxd8+ against Ahmed on Tuesday, and again today.",
  );
});
