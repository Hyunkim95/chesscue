import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type {
  CheckedTry,
  CheckFailure,
} from "../../application/run-moment/check-try";
import { err, type Result } from "../../shared/result/result";
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

const square = (name: string) =>
  screen.getByRole("gridcell", { name: new RegExp(`^${name}`) });

it("plays the tapped move on the board before the engine answers, and takes it back if the check fails", async () => {
  let answer: (result: Result<CheckedTry, CheckFailure>) => void = () =>
    undefined;
  render(
    <MomentScreen
      moment={FORK}
      online={false}
      checkMove={() =>
        new Promise((resolve) => {
          answer = resolve;
        })
      }
      checkFrom={() => new Promise(() => undefined)}
      analyzePosition={() => new Promise(() => undefined)}
      askRook={() => Promise.resolve({ kind: "unrouted" })}
      onComplete={() => undefined}
      onContinue={() => undefined}
    />,
  );
  fireEvent.click(square("White knight on f3"));
  fireEvent.click(square("Black pawn on g5"));

  expect(square("White knight on g5")).toBeVisible();
  expect(screen.getByText("Let me see…")).toBeVisible();
  // Nothing to undo while the move is being checked.
  expect(screen.queryByRole("button", { name: "↺ Reset" })).toBeNull();

  await act(async () => {
    answer(err({ code: "crashed", message: "Engine stopped." }));
    await Promise.resolve();
  });
  expect(square("White knight on f3")).toBeVisible();
  expect(
    screen.getByText("I couldn't check that move just now. Try it again."),
  ).toBeVisible();
});
