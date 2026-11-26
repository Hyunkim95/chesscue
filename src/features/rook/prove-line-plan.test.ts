import { Chess } from "chess.js";
import { expect, test } from "vitest";

import { proveLinePlan } from "./prove-line-plan";

const fen = "7k/6p1/8/2pp4/2P2pq1/5Nnp/PP3QP1/3B2K1 b - - 2 39";

function replay(start: string, steps: string[]) {
  const board = new Chess(start);
  return steps.map((san) => board.move(san));
}

test("connects the first check to the bishop capture and proves the other reply", async () => {
  const plan = await proveLinePlan(
    replay(fen, ["h2+", "Nxh2", "Qxd1+", "Nf1", "d4"]),
    replay(fen, ["Qg6", "cxd5"]),
    new AbortController().signal,
  );
  expect(plan?.text).toContain("Nxh2");
  expect(plan?.text).toContain("f3");
  expect(plan?.text).toContain("bishop on d1");
  expect(plan?.text).toContain("Kxh2");
  expect(plan?.text).toMatch(/mate in at most 3/);
  expect(plan?.text).toContain("Qg6");
});

test("withholds a verdict on disconnected branches, missing payoffs and cancellation", async () => {
  const strong = replay(fen, ["h2+", "Nxh2"]);
  const attempted = replay(fen, ["Qg6", "cxd5"]);
  expect(
    await proveLinePlan(strong, attempted, new AbortController().signal),
  ).toBeNull();
  expect(
    await proveLinePlan(
      strong,
      replay(new Chess().fen(), ["e4"]),
      new AbortController().signal,
    ),
  ).toBeNull();
  expect(
    await proveLinePlan(strong, attempted, AbortSignal.abort()),
  ).toBeNull();
});

test("explains an immediately lost queen and verifies its safe square on the other board", async () => {
  const start =
    "r1bq1rk1/pp3ppp/2n2n2/1N1pp3/5Q2/1B1P4/PPP2PPP/R3K1NR w KQ - 0 11";
  const plan = await proveLinePlan(
    replay(start, ["Qd2", "a6"]),
    replay(start, ["Qb4", "Nxb4"]),
    new AbortController().signal,
  );
  expect(plan?.text).toContain("queen on b4");
  expect(plan?.text).toContain("d2");
  expect(plan?.text).toContain("no immediate");
});

test("distinguishes an immediate mating reply from a legal defense", async () => {
  const start = "rn1q3r/ppp2Nbk/4Qn1p/3p2p1/3P4/2P5/PP3PPP/RNB1K2R b KQ - 2 15";
  const plan = await proveLinePlan(
    replay(start, ["Qe8", "Qxe8"]),
    replay(start, ["Qg8", "Qf5#"]),
    new AbortController().signal,
  );
  expect(plan?.text).toContain("Qf5#");
  expect(plan?.text).toContain("no mate in one");
});
