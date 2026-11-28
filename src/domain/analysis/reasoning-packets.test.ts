import { expect, it } from "vitest";

import { positionPacket } from "./position-packet";
import { positionProblems } from "./validate-why";

it("describes the position for an open question without naming the player's moves", () => {
  const fen = "4k3/pp6/8/8/5b2/8/PP1Q4/4K3 w - - 0 1";
  const packet = positionPacket({
    fen,
    learner: "w",
    goal: "One move here wins material.",
  });
  expect(packet).toMatchObject({
    youAre: "White",
    toMove: "you",
    material: "6 points ahead",
    goal: "One move here wins material.",
    myThreats: ["The bishop on f4 can win your queen on d2."],
    bestMove: null,
  });
  expect(packet?.approach).toBe(
    "Look at every check, capture and threat you have before choosing.",
  );
  if (!packet) throw new Error("No packet");
  expect(JSON.stringify(packet)).not.toMatch(/Qxf4|Qd8/);
  expect(
    positionProblems(
      "My bishop on f4 can win your queen on d2, so look after her first.",
      packet,
    ),
  ).toEqual([]);
  expect(positionProblems("Take my bishop with Qxf4.", packet)).toContain(
    "move Qxf4",
  );
});

it('accepts "forced" only when the packet itself says there is a forced mate', () => {
  const fen = "4k3/pp6/8/8/5b2/8/PP1Q4/4K3 w - - 0 1";
  const quiet = positionPacket({ fen, learner: "w" });
  const mating = positionPacket({
    fen,
    learner: "w",
    goal: "There's a forced mate here.",
  });
  if (!quiet || !mating) throw new Error("No packet");
  const text = "There's a forced mate here, so look at your checks.";
  expect(positionProblems(text, quiet)).toContain("forced");
  expect(positionProblems(text, mating)).toEqual([]);
});

it("tells an open question what the best move does once it is solved", () => {
  const fen = "4k3/pp6/8/8/5b2/8/PP1Q4/4K3 w - - 0 1";
  const packet = positionPacket({
    fen,
    learner: "w",
    answerLine: ["d2f4"],
  });
  expect(packet).toMatchObject({
    approach: null,
    bestMove: {
      move: "Qxf4",
      takes: "the bishop on f4",
      line: ["Qxf4"],
      endsWith: "9 points ahead",
    },
  });
});
