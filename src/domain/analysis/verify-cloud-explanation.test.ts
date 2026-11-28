import { Chess } from "chess.js";
import { expect, test } from "vitest";

import { verifyCloudExplanation } from "./verify-cloud-explanation";

const startingFen =
  "2k3rr/pp1q1p2/3p1p2/1p1N4/1P1QP2p/P4bP1/2P2P1P/R4RK1 b - - 0 20";
function makeLine(moves: readonly string[], prefix: string) {
  const board = new Chess(startingFen);
  return moves.map((san, index) => {
    const move = board.move(san);
    return {
      id: prefix + String(index + 1),
      before: move.before,
      from: move.from,
      to: move.to,
      ...(move.promotion && { promoted: move.promotion }),
    };
  });
}
const packet = {
  startingFen,
  stronger: makeLine(
    ["Qh3", "Qc3+", "Kb8", "Qc7+", "Ka8", "Qd8+", "Rxd8"],
    "S",
  ),
  attempted: makeLine(["hxg3", "fxg3", "Rxh2"], "A"),
};

test("rejects the recorded cloud answer even if all its evidence IDs exist", () => {
  expect(
    verifyCloudExplanation(packet, {
      status: "explained",
      explanation:
        "{{S1}} threatens Qxg2 mate. White checks until {{S7}} takes the queen.",
      evidence: ["S1", "S7"],
    }),
  ).toEqual({ status: "rejected", reason: "raw-notation" });
});

test("renders move notation from the exact checked position", () => {
  expect(
    verifyCloudExplanation(packet, {
      status: "explained",
      explanation:
        "White checks with {{S2}} and {{S4}}, but {{S7}} takes the queen on {{square:d8}}.",
      evidence: ["S2", "S4", "S7"],
    }),
  ).toEqual({
    status: "verified",
    explanation:
      "White checks with Qc3+ and Qc7+, but Rxd8 takes the queen on d8.",
    evidence: ["S2", "S4", "S7"],
  });
});

test("rejects a legal move ID attached to a different board", () => {
  const stale = {
    ...packet,
    stronger: packet.stronger.map((move, index) =>
      index === 1 ? { ...move, before: startingFen } : move,
    ),
  };
  expect(
    verifyCloudExplanation(stale, {
      status: "explained",
      explanation: "{{S2}} gives check.",
      evidence: ["S2"],
    }),
  ).toEqual({ status: "rejected", reason: "invalid-replay" });
});

test("rejects invented, uncited, and malformed move references", () => {
  const verify = (explanation: string, evidence: readonly string[]) =>
    verifyCloudExplanation(packet, {
      status: "explained",
      explanation,
      evidence,
    });
  expect(verify("{{S9}} wins.", ["S9"])).toMatchObject({ status: "rejected" });
  expect(verify("{{S2}} gives check.", ["S1"])).toMatchObject({
    status: "rejected",
  });
  expect(verify("{{S2 gives check.", ["S2"])).toMatchObject({
    status: "rejected",
  });
  expect(verify("Play g2.", ["S2"])).toMatchObject({ status: "rejected" });
});

test("checks square control at the cited point in the replay", () => {
  const fen = "2r5/5pkp/1q1p2p1/3Pp1PP/p7/P1r2Q2/1P2BP2/1K1R4 w - - 1 31";
  const board = new Chess(fen);
  const stronger = ["Qf6+", "Kg8"].map((san, index) => {
    const move = board.move(san);
    return {
      id: `S${String(index + 1)}`,
      before: move.before,
      from: move.from,
      to: move.to,
    };
  });
  const verify = (explanation: string) =>
    verifyCloudExplanation(
      { startingFen: fen, stronger, attempted: [] },
      {
        status: "explained",
        explanation,
        evidence: ["S1", "S2"],
      },
    );
  expect(verify("{{S1}} gives check and {{control:S1:f6:h8}}.")).toEqual({
    status: "rejected",
    reason: "unsupported-control",
  });
  expect(verify("{{S1}} gives check. {{control:S2:f6:h8}}.")).toMatchObject({
    status: "verified",
    explanation: "Qf6+ gives check. White’s queen on f6 covers h8 after Kg8.",
  });
  expect(verify("{{S1}} covers {{square:h8}}.")).toEqual({
    status: "rejected",
    reason: "raw-control",
  });
});

test("rejects an assertion about a pawn's former diagonal that the board does not support", () => {
  const fen = "2B5/5b2/1p1k3p/p1p2Kp1/P1P3P1/1P5P/8/8 b - - 1 39";
  const board = new Chess(fen);
  const stronger = ["b5", "axb5", "Bxc4"].map((san, index) => {
    const move = board.move(san);
    return {
      id: `S${String(index + 1)}`,
      before: move.before,
      from: move.from,
      to: move.to,
    };
  });
  const verify = (explanation: string) =>
    verifyCloudExplanation(
      { startingFen: fen, stronger, attempted: [] },
      {
        status: "explained",
        explanation,
        evidence: ["S1", "S2", "S3"],
      },
    );
  expect(
    verify(
      "After {{S2}}, White’s pawn has left the diagonal where it could recapture on {{square:c4}}. {{S3}} wins material.",
    ),
  ).toEqual({ status: "rejected", reason: "raw-pawn-claim" });
  expect(verify("{{lost-control:S2:c4}}. {{S3}} wins material.")).toEqual({
    status: "rejected",
    reason: "unsupported-control",
  });
});

test("renders an actual change in pawn control and verifies passed status", () => {
  const board = new Chess("7k/8/3p4/8/8/8/4P3/K7 w - - 0 1");
  const move = board.move("e4");
  const packet = {
    startingFen: move.before,
    stronger: [{ id: "S1", before: move.before, from: move.from, to: move.to }],
    attempted: [],
  };
  const verify = (explanation: string) =>
    verifyCloudExplanation(packet, {
      status: "explained",
      explanation,
      evidence: ["S1"],
    });
  expect(verify("{{S1}} advances. {{lost-control:S1:d3}}.")).toMatchObject({
    status: "verified",
    explanation: "e4 advances. White’s pawn no longer covers d3 after e4.",
  });
  expect(verify("{{S1}} advances. {{passed:S1:e4}}.")).toMatchObject({
    status: "rejected",
    reason: "unsupported-pawn",
  });
});
