import { expect, it } from "vitest";

import {
  hasClearBestMove,
  isServableMoment,
  momentGoal,
  puzzleGoal,
} from "./moment-goal";

it("states the goal without naming a tactic, and names a plan's goal", () => {
  expect(
    momentGoal(
      "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19",
      ["g4g5", "g8h8", "g5g7"],
      "Find a move or preparation that attacks two targets.",
    ),
  ).toEqual({ kind: "mate", prompt: "There's a forced mate here." });
});

const UNIT_GOAL =
  "Develop a piece or support the centre while keeping the king safe.";

it("names the sleeping pieces when the best move develops one", () => {
  // 1. e4 e5 2. Nf3 Nc6: White's best is Bc4.
  expect(
    momentGoal(
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
      ["f1c4", "f8c5"],
      UNIT_GOAL,
    ),
  ).toEqual({
    kind: "plan",
    prompt:
      "Your knight on b1 and bishops on c1 and f1 are still asleep. Wake one up.",
    arrows: [],
    outlines: [
      { square: "b1", tone: "jade" },
      { square: "c1", tone: "jade" },
      { square: "f1", tone: "jade" },
    ],
  });
  expect(
    momentGoal(
      "rnbqkbnr/pppppppp/8/8/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 1",
      ["c1g5"],
      UNIT_GOAL,
    ).prompt,
  ).toBe("Your bishop on c1 is still asleep. Wake it up.");
});

it("points at Rook's threat when the best move deals with it", () => {
  // Two Knights after 4. Ng5: Nxf7 wins a pawn and forks; d5 blocks it.
  expect(
    momentGoal(
      "r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4",
      ["d7d5", "e4d5"],
      UNIT_GOAL,
    ),
  ).toEqual({
    kind: "plan",
    prompt: "First, deal with my threat.",
    arrows: [
      { from: "g5", to: "f7", kind: "reply" },
      { from: "c4", to: "f7", kind: "reply" },
    ],
    outlines: [{ square: "f7", tone: "coral" }],
  });
});

it("asks for king safety when the best move castles, and the centre for a central pawn", () => {
  const castle = momentGoal(
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5",
    ["e1g1"],
    UNIT_GOAL,
  );
  expect(castle).toMatchObject({
    prompt: "Get your king to safety.",
    outlines: [{ square: "e1", tone: "jade" }],
  });
  const centre = momentGoal(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    ["e2e4"],
    UNIT_GOAL,
  );
  expect(centre).toMatchObject({ prompt: "Fight for the centre." });
  expect(
    centre.kind === "plan" && centre.outlines.map(({ square }) => square),
  ).toEqual(["d4", "e4", "d5", "e5"]);
});

it("falls back to the unit's goal when the best move does nothing concrete", () => {
  expect(
    momentGoal("4k3/8/8/8/8/8/P7/4K3 w - - 0 1", ["a2a3"], UNIT_GOAL),
  ).toEqual({
    kind: "plan",
    prompt:
      "Goal: develop a piece or support the centre while keeping the king safe.",
    arrows: [],
    outlines: [],
  });
});

it("serves a plan position only when one move is clearly best", () => {
  const quiet = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  expect(
    hasClearBestMove([{ evaluationCp: -10 }, { evaluationCp: -113 }]),
  ).toBe(true);
  expect(hasClearBestMove([{ evaluationCp: 28 }, { evaluationCp: 20 }])).toBe(
    false,
  );
  expect(hasClearBestMove([{ evaluationCp: 28 }])).toBe(false);
  expect(
    isServableMoment(
      quiet,
      ["e2e4"],
      [{ evaluationCp: 28 }, { evaluationCp: 20 }],
    ),
  ).toBe(false);
  // A tactic is served however close the other moves are.
  expect(
    isServableMoment(
      "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19",
      ["g4g5", "g8h8", "g5g7"],
      [{ evaluationCp: 100_000 }, { evaluationCp: 100_000 }],
    ),
  ).toBe(true);
});

it("gives a library puzzle a goal that never names its idea", () => {
  // Lichess 0N7LQ nets a bishop for two pawns: one point, still a win.
  expect(
    puzzleGoal(
      "r4rk1/pp1b3p/1q2p1p1/4bpP1/3Pp3/2P5/PPQN3P/R1B2RK1 w - - 0 17",
      ["d2c4", "e5d4", "c3d4", "b6d4", "c1e3"],
    ),
  ).toEqual({ kind: "material", prompt: "One move here wins material." });
  expect(
    puzzleGoal("r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19", [
      "g4g5",
      "g8h8",
      "g5g7",
    ]).prompt,
  ).toBe("There's a forced mate here.");
  expect(
    puzzleGoal("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", [
      "g1f3",
    ]),
  ).toEqual({ kind: "best", prompt: "Find the strongest move here." });
});
