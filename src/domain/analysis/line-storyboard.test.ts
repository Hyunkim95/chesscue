import { expect, it } from "vitest";

import {
  alternativeFrame,
  lineStoryboard,
  payoffFrame,
} from "./line-storyboard";

it("draws the fork, the forced reply and the mate", () => {
  const frames = lineStoryboard(
    "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19",
    ["g4g5", "g8h8", "g5g7"],
  );
  expect(frames.map(({ caption }) => caption)).toEqual([
    "Qxg5+ takes my pawn, checks my king and attacks my knight on d2, which nothing defends.",
    "I have to play Kh8.",
    "Qg7# is checkmate.",
  ]);
  expect(frames[0]?.arrows).toEqual([
    { from: "g4", to: "g5", kind: "preview" },
    { from: "g5", to: "g8", kind: "attack" },
    { from: "g5", to: "d2", kind: "attack" },
  ]);
  expect(frames[2]?.arrows).toContainEqual({
    from: "g7",
    to: "h8",
    kind: "attack",
  });
  expect(frames[2]?.outlines).toEqual([{ square: "h8", tone: "coral" }]);
});

it("stops at an illegal move and refuses a bad position", () => {
  expect(
    lineStoryboard("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", ["e2e4", "a1a8"]),
  ).toHaveLength(1);
  expect(lineStoryboard("not a fen", ["e2e4"])).toEqual([]);
});

it("starts with Rook's move when the line is a what-if for his defence", () => {
  // After 1. Ng5+ in the fork position, Rook tries Kf6 instead of Kg8.
  const frames = lineStoryboard(
    "2r5/5k2/4q3/1rBp2N1/p2P1p2/PpR3Pp/1P2KP1P/2R5 b - - 0 35",
    ["f7f6", "g5e6", "f6e6"],
    "w",
  );
  expect(frames.map(({ by }) => by)).toEqual(["rook", "learner", "rook"]);
  expect(frames[0]?.caption).toBe("I answer Kf6+ and check your king.");
  // The check is discovered, so the arrow comes from the piece behind.
  expect(frames[0]?.arrows).toContainEqual({
    from: "e6",
    to: "e2",
    kind: "attack",
  });
  expect(frames[1]?.caption).toBe(
    "Nxe6 takes my queen and attacks my pawn on f4, which nothing defends.",
  );
});

it("shows a quiet move by the central squares it takes control of", () => {
  const [frame] = lineStoryboard(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    ["g1f3"],
  );
  expect(frame?.caption).toBe("Nf3 adds control of d4 and e5.");
  expect(frame?.control).toEqual([
    { square: "d4", change: "gained" },
    { square: "e5", change: "gained" },
  ]);
});

it("names what each quiet move newly does and draws it", () => {
  // 1. e4 e5 2. Nf3 Nc6, then Bc4 Bc5 c3.
  const frames = lineStoryboard(
    "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    ["f1c4", "f8c5", "c2c3"],
  );
  expect(frames.map(({ caption }) => caption)).toEqual([
    "Bc4 aims at f7 and adds control of d5 and e6.",
    "I answer Bc5, aiming at f2.",
    "c3 adds control of d4.",
  ]);
  expect(frames[0]?.arrows).toContainEqual({
    from: "c4",
    to: "f7",
    kind: "attack",
  });
  expect(frames[0]?.control.map(({ square }) => square)).toEqual(["d5", "e6"]);
  expect(frames[1]?.outlines).toEqual([{ square: "f2", tone: "coral" }]);
});

it("says a defending move defends, and a castle gets the king safe", () => {
  // 1. e4 e5 2. Nf3: Nc6 defends the attacked e5 pawn.
  const [defend] = lineStoryboard(
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    ["b8c6"],
  );
  expect(defend?.caption).toBe(
    "Nc6 defends your pawn on e5 and adds control of d4.",
  );
  expect(defend?.outlines).toEqual([{ square: "e5", tone: "jade" }]);
  const [castle, reply] = lineStoryboard(
    "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5",
    ["e1g1", "e8g8"],
  );
  expect(castle?.caption).toBe("O-O gets your king to safety.");
  expect(castle?.outlines).toEqual([{ square: "g1", tone: "jade" }]);
  expect(reply?.caption).toBe("I answer O-O and tuck my king away.");
});

it("joins several loose targets in one clause", () => {
  // Two Knights: after 6. Bb5+ c6 the bishop and the d5 pawn both hang.
  const frames = lineStoryboard(
    "r1bqkb1r/ppp2ppp/5n2/n2Pp1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 1 6",
    ["c4b5", "c7c6"],
    "b",
  );
  expect(frames[1]?.caption).toBe(
    "c6 attacks my bishop on b5 and my pawn on d5, and neither is defended.",
  );
});

it("adds Rook's move and what it adds when the player found another good move", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const frame = alternativeFrame(start, "e2e4", "g1f3");
  expect(frame?.caption).toBe("Nf3 works too. It also covers d4 and e5.");
  expect(frame?.arrows).toEqual([{ from: "g1", to: "f3", kind: "preview" }]);
  expect(frame?.control.map(({ square }) => square)).toEqual(["d4", "e5"]);
  expect(
    alternativeFrame(
      "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
      "f1b5",
      "f1c4",
    )?.caption,
  ).toBe("Bc4 works too. It also aims at f7.");
  expect(alternativeFrame(start, "g1f3", "g1f3")).toBeUndefined();
});

it("ends a winning line with what the learner comes out with", () => {
  // Lichess 0N7LQ: Nc4 hits queen and bishop; Black saves both with checks
  // but gives up the bishop for two pawns.
  const fork = "r4rk1/pp1b3p/1q2p1p1/4bpP1/3Pp3/2P5/PPQN3P/R1B2RK1 w - - 0 17";
  const frames = lineStoryboard(fork, ["d2c4", "e5d4", "c3d4", "b6d4", "c1e3"]);
  const payoff = payoffFrame(fork, frames);
  expect(payoff?.caption).toBe("You've won a bishop for two pawns.");
  expect(payoff?.outlines).toEqual([{ square: "d4", tone: "jade" }]);
  expect(payoff?.fen).toBe(frames.at(-1)?.fen);
  expect(payoff?.moveUci).toBe("");

  // Lichess 0jcIg: the knight check forks king and rook.
  const knight = "1R6/6p1/1p2k2p/3n1N2/6P1/pr3PK1/8/8 w - - 0 47";
  expect(
    payoffFrame(knight, lineStoryboard(knight, ["f5d4", "e6e5", "d4b3"]))
      ?.caption,
  ).toBe("You've won a rook.");
});

it("adds no payoff to a mate or a line that wins nothing", () => {
  const mate = "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19";
  expect(
    payoffFrame(mate, lineStoryboard(mate, ["g4g5", "g8h8", "g5g7"])),
  ).toBeUndefined();
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  expect(
    payoffFrame(start, lineStoryboard(start, ["g1f3", "d7d5"])),
  ).toBeUndefined();
});
