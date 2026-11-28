import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import {
  alternativeFrame,
  costFrame,
  insteadFrame,
  lineStoryboard,
  payoffFrame,
  isQuietMove,
  pointStoryboard,
  refutationStoryboard,
} from "./line-storyboard";

// Lichess 0jcIg: Nd4+ forks king and rook.
const KNIGHT_FORK = "1R6/6p1/1p2k2p/3n1N2/6P1/pr3PK1/8/8 w - - 0 47";
const KNIGHT_LINE = ["f5d4", "e6e5", "d4b3"];
const WARM_UP = "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19";

it("says what a tried move costs from Rook's side, and draws it", () => {
  const knight = lineStoryboard(KNIGHT_FORK, ["f5h6", "g7h6"]);
  const won = costFrame(KNIGHT_FORK, knight, "w", KNIGHT_LINE);
  expect(won?.caption).toBe("I win your knight for a pawn.");
  expect(won?.outlines).toEqual([{ square: "h6", tone: "coral" }]);
  expect(won?.by).toBe("rook");
  expect(won?.fen).toBe(knight.at(-1)?.fen);

  // A quiet try lets the forked rook walk away.
  const quiet = lineStoryboard(KNIGHT_FORK, ["b8b7", "b3b2"]);
  const kept = costFrame(KNIGHT_FORK, quiet, "w", KNIGHT_LINE);
  expect(kept?.caption).toBe("You missed a chance to win my rook. Try again.");
  expect(
    costFrame(KNIGHT_FORK, quiet, "w", KNIGHT_LINE, "level")?.caption,
  ).toBe("That's safe, but you missed a chance to win my rook. Try again.");
  expect(kept?.outlines).toEqual([{ square: "b2", tone: "coral" }]);
  expect(costFrame(KNIGHT_FORK, quiet, "w")).toBeUndefined();

  // A back-rank try.
  const backRank = "4r1k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
  const mate = costFrame(
    backRank,
    lineStoryboard(backRank, ["a1a3", "e8e1"]),
    "w",
  );
  expect(mate?.caption).toBe("That lets me mate.");
  expect(mate?.outlines).toEqual([{ square: "g1", tone: "coral" }]);
  expect(mate?.arrows).toEqual([{ from: "e1", to: "g1", kind: "attack" }]);

  // Missing a mate: Rook's king gets away.
  const escape = costFrame(
    WARM_UP,
    lineStoryboard(WARM_UP, ["f1f2", "d2f3"]),
    "w",
    ["g4g5", "g8h8", "g5g7"],
  );
  expect(escape?.caption).toBe("My king gets away.");
  expect(escape?.outlines).toEqual([{ square: "g8", tone: "coral" }]);
});

it("closes a refutation with the line move and what it wins", () => {
  const fork = insteadFrame(KNIGHT_FORK, KNIGHT_LINE, "w");
  expect(fork?.caption).toBe("Nd4+ instead wins the rook.");
  expect(fork?.fen).toBe(KNIGHT_FORK);
  expect(fork?.arrows).toEqual([{ from: "f5", to: "d4", kind: "preview" }]);
  expect(fork?.outlines).toEqual([{ square: "b3", tone: "jade" }]);
  expect(insteadFrame(WARM_UP, ["g4g5", "g8h8", "g5g7"], "w")?.caption).toBe(
    "Qxg5+ instead leads to mate.",
  );
  expect(insteadFrame(WARM_UP, ["g5g7"], "w")).toBeUndefined();
});

it("plays a refutation and names the line move only once the answer is known", () => {
  const before = refutationStoryboard({
    fen: KNIGHT_FORK,
    line: ["b8b7", "b3b2"],
    learner: "w",
    standing: "better",
    instead: KNIGHT_LINE,
    answerKnown: false,
  });
  expect(before.map(({ caption }) => caption)).toEqual([
    "Rb7 attacks my pawn on g7, which nothing defends.",
    "I answer Rb2.",
    "You missed a chance to win my rook. Try again.",
  ]);
  const after = refutationStoryboard({
    fen: KNIGHT_FORK,
    line: ["b8b7", "b3b2"],
    learner: "w",
    standing: "better",
    instead: KNIGHT_LINE,
    answerKnown: true,
  });
  expect(after.at(-1)).toMatchObject({
    caption:
      "Nd4+ forks my king and rook, so after Ke5 you take the rook with Nxb3.",
    arrows: [
      { from: "d4", to: "e6", kind: "attack" },
      { from: "d4", to: "b3", kind: "attack" },
      { from: "e6", to: "e5", kind: "reply" },
    ],
  });

  const [sameFork] = lineStoryboard(KNIGHT_FORK, KNIGHT_LINE);
  expect(insteadFrame(KNIGHT_FORK, KNIGHT_LINE, "w", sameFork)?.caption).toBe(
    "Nd4+ instead wins the rook.",
  );

  // No material changes hands: Stockfish's verdict closes the line.
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const level = refutationStoryboard({
    fen: start,
    line: ["a2a3", "e7e5"],
    learner: "w",
    standing: "level",
    instead: ["e2e4", "e7e5"],
    answerKnown: true,
  });
  expect(level.map(({ caption }) => caption).slice(-2)).toEqual([
    "After a3 the position stays level.",
    "Stockfish prefers e4 here.",
  ]);
});

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

// Lichess 71JEGeuZ: after Kd8, Qxb7 hits the loose rook and knight at once.
it("names and draws a fork in Rook's reply", () => {
  const [, reply] = lineStoryboard(
    "r5nr/pppkbpp1/n2p1q1p/1Q1Pp3/4P3/2N2N2/PPP2PPP/R1B1K2R b KQ - 3 10",
    ["d7d8", "b5b7", "a8b8"],
  );
  expect(reply?.by).toBe("rook");
  expect(reply?.moveUci).toBe("b5b7");
  expect(reply?.caption).toBe(
    "I take your pawn with Qxb7 and attack your rook on a8 and your knight on a6 at once.",
  );
  expect(reply?.arrows).toEqual([
    { from: "b5", to: "b7", kind: "reply" },
    { from: "b7", to: "a8", kind: "attack" },
    { from: "b7", to: "a6", kind: "attack" },
  ]);
  expect(reply?.outlines.map(({ square }) => square)).toEqual([
    "b7",
    "a8",
    "a6",
  ]);
});

// Lichess zkd3x5b1: after Nc3, d4 uncovers the bishop on e6 onto the queen.
it("names and draws the line Rook's reply uncovers", () => {
  const [, reply] = lineStoryboard(
    "2r3k1/p4ppp/1p2bn2/q2p4/8/1Q2P1B1/PP3PPP/1N3RK1 w - - 2 21",
    ["b1c3", "d5d4", "b3a4"],
  );
  expect(reply?.caption).toBe(
    "I answer d4, opening my bishop on e6 onto your queen on b3.",
  );
  expect(reply?.arrows).toEqual([
    { from: "d5", to: "d4", kind: "reply" },
    { from: "e6", to: "b3", kind: "attack" },
  ]);
  expect(reply?.outlines).toEqual([{ square: "b3", tone: "coral" }]);
});

// Every claim in a caption is drawn: a capture outlines the piece taken, and
// a move forced by check shows the check.
it("draws the piece Rook takes and the check that forces his move", () => {
  const [, take] = lineStoryboard(KNIGHT_FORK, ["f5h6", "g7h6"]);
  expect(take?.caption).toBe("I take your knight with gxh6.");
  expect(take?.outlines).toEqual([{ square: "h6", tone: "coral" }]);

  // Nf7+ leaves the king on h8 one move.
  const [, forced] = lineStoryboard("7k/6pp/8/6N1/8/8/8/6K1 w - - 0 1", [
    "g5f7",
    "h8g8",
  ]);
  expect(forced?.caption).toBe("I have to play Kg8.");
  expect(forced?.outlines).toEqual([{ square: "h8", tone: "coral" }]);
  expect(forced?.arrows).toEqual([
    { from: "h8", to: "g8", kind: "reply" },
    { from: "f7", to: "h8", kind: "attack" },
  ]);
});

// Show, don't tell: a frame that claims something about the board draws it,
// beyond the arrow of the move itself. Only captions that name nothing but
// the move ("I answer Kd1.", "I have to play Kh8.") are exempt.
it("draws every claim a frame makes", () => {
  const lines: readonly (readonly [string, readonly string[]])[] = [
    [
      "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19",
      ["g4g5", "g8h8", "g5g7"],
    ],
    [
      "r4rk1/pp1b3p/1q2p1p1/4bpP1/3Pp3/2P5/PPQN3P/R1B2RK1 w - - 0 17",
      ["d2c4", "e5d4", "c3d4", "b6d4", "c1e3"],
    ],
    [
      "1R6/6p1/1p2k2p/3n1N2/6P1/pr3PK1/8/8 w - - 0 47",
      ["f5d4", "e6e5", "d4b3"],
    ],
    [
      "r3r1k1/ppp2ppp/3p1q2/2n2bN1/N1PP4/8/PPQ1P1PP/R1B1KB1R w KQ - 1 14",
      ["c2c3", "c5d3", "e1d1", "d3f2", "d1d2", "h7h6"],
    ],
    [
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      ["g1f3", "d7d5", "d2d4", "c8f5"],
    ],
  ];
  const nameOnly =
    /^(?:I answer \S+\.|I have to play \S+\.|\S+ moves your \w+ to [a-h][1-8]\.)$/;
  for (const [fen, line] of lines)
    for (const frame of lineStoryboard(fen, line)) {
      if (nameOnly.test(frame.caption)) continue;
      const marks =
        frame.arrows.filter(
          ({ from, to }) => `${from}${to}` !== frame.moveUci.slice(0, 4),
        ).length +
        frame.outlines.length +
        frame.control.length;
      expect(marks, `"${frame.caption}" draws nothing`).toBeGreaterThan(0);
    }
});

it("counts a piece the other side can take back at once before claiming a win", () => {
  // Nxg5+ Kf6 Nxe6 wins the queen, but Black's king then takes the knight.
  const fork = "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35";
  expect(
    payoffFrame(fork, lineStoryboard(fork, ["f3g5", "f7f6", "g5e6"]))?.caption,
  ).toBe("You've won a queen and a pawn for a knight.");
});

it("opens with the point and stops once the material settles", () => {
  const mate = pointStoryboard(
    "r4rk1/ppq2p1p/4pP2/3pP1p1/6Q1/2P5/PP1n2PP/R4R1K w - - 0 19",
    ["g4g5", "g8h8", "g5g7"],
  );
  const fork = pointStoryboard(
    "r4rk1/pp1b3p/1q2p1p1/4bpP1/3Pp3/2P5/PPQN3P/R1B2RK1 w - - 0 17",
    ["d2c4", "e5d4", "c3d4", "b6d4", "c1e3"],
  );
  const knight = pointStoryboard(
    "1R6/6p1/1p2k2p/3n1N2/6P1/pr3PK1/8/8 w - - 0 47",
    ["f5d4", "e6e5", "d4b3"],
  );
  // The point is said on the first move's own frame.
  expect(mate?.frames.map(({ caption }) => caption)).toEqual([
    "Qxg5+ leads to mate. It comes with check.",
    "I have to play Kh8.",
    "Qg7# is checkmate.",
  ]);
  expect(mate?.moves).toEqual(["g4g5", "g8h8", "g5g7"]);
  expect(fork?.frames[0]?.caption).toBe(
    "Nc4 wins a bishop for two pawns. It hits two pieces at once.",
  );
  expect(fork?.frames.at(-1)?.caption).toBe(
    "You've won a bishop for two pawns.",
  );
  expect(knight?.frames[0]?.caption).toBe(
    "Nd4+ wins a rook. It hits two pieces at once.",
  );
  // A quiet line has no point to show.
  expect(
    pointStoryboard(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      ["g1f3", "d7d5"],
    ),
  ).toBeUndefined();
});

it("names the net gain and a quiet move's mate threat", () => {
  // Qxd2 Rxd2 Kxd2: queen for queen cancels, so the gain is the rook.
  const swap = "3rk3/8/8/8/8/8/3q4/R2QK3 w - - 0 1";
  expect(
    payoffFrame(swap, lineStoryboard(swap, ["d1d2", "d8d2", "e1d2"]))?.caption,
  ).toBe("You've won a rook.");
  // Qf3 threatens Qxf7#, and says so with the mating move drawn.
  const italian =
    "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3";
  const [qf3] = lineStoryboard(italian, ["d1f3"]);
  expect(qf3?.caption).toBe("Qf3 threatens mate with Qxf7#.");
  expect(qf3?.arrows.map(({ from, to }) => `${from}${to}`)).toContain("f3f7");
});

// Lichess 0fVN0 with Stockfish's depth-14 line: the fork wins the queen on
// move 3, and the line then picks up pawns.
const QUEEN_FORK = "6k1/pp3pp1/2p4p/8/6q1/1N1P2Pn/PP2QPKP/4R3 b - - 4 26";
const QUEEN_FORK_LINE = [
  "h3f4",
  "g2g1",
  "f4e2",
  "g1f1",
  "g4f3",
  "b3d2",
  "e2g3",
  "h2g3",
  "f3d3",
  "e1e2",
  "d3a6",
  "b2b3",
  "a6a2",
  "e2e8",
  "g8h7",
  "f1e2",
  "a2a6",
  "d2c4",
];

it("stops the point storyboard where the point lands, not at the line's last capture", () => {
  const story = pointStoryboard(QUEEN_FORK, QUEEN_FORK_LINE);
  expect(story?.frames.map(({ caption }) => caption)).toEqual([
    "Nf4+ wins a queen. It hits two pieces at once.",
    "I answer Kg1.",
    "Nxe2+ takes my queen and checks my king.",
    "You've won a queen.",
  ]);
  // The queen is the goal on every step, and not on the result.
  expect(story?.frames.map(({ goal }) => goal)).toEqual([
    { square: "e2", piece: "queen" },
    { square: "e2", piece: "queen" },
    { square: "e2", piece: "queen" },
    undefined,
  ]);
});

it("keeps a long point's goal on the piece as it moves", () => {
  // Lichess 0ZyeL: the queen on d2 recaptures on e3 and is won there.
  const story = pointStoryboard(
    "2nr1rk1/5pp1/5q1p/pPbp4/P1P1p2P/4P3/1B1QN1P1/RN4KR b - - 0 21",
    ["c5e3", "d2e3", "f6b2", "b1c3", "b2a1", "g1h2", "d5d4", "h1a1", "d4e3"],
  );
  const goals = story?.frames.map(({ goal }) => goal?.square);
  expect(goals?.slice(0, 2)).toEqual(["d2", "e3"]);
  expect(goals?.at(-2)).toBe("e3");
  expect(story?.frames[0]?.goal?.piece).toBe("queen");
});

it("plays on while Rook can win material straight back", () => {
  // Rxa7 wins the queen, but Bxe4 takes the loose knight at once.
  const story = pointStoryboard("6k1/q4ppp/2b5/8/4N3/8/5PPP/R5K1 w - - 0 1", [
    "a1a7",
    "c6e4",
  ]);
  expect(story?.frames[0]?.caption).toMatch(
    /^Rxa7 wins a queen for a knight\./,
  );
  expect(story?.frames).toHaveLength(3);
});

it("names the king as the goal of a mate", () => {
  const mate = pointStoryboard(WARM_UP, ["g4g5", "g8h8", "g5g7"]);
  expect(mate?.frames.map(({ goal }) => goal)).toEqual([
    { square: "g8", piece: "king" },
    { square: "h8", piece: "king" },
    { square: "h8", piece: "king" },
  ]);
});

it("calls a move quiet only when it captures nothing, gives no check and offers nothing", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  expect(isQuietMove(start, "g1f3")).toBe(true);
  // The Greek gift: Bxh7+ takes a pawn with check.
  const greek =
    "r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R2QK2R w KQ - 0 8";
  expect(isQuietMove(greek, "d3h7")).toBe(false);
  // Nd5 offers the knight to the pawn on e6.
  expect(
    isQuietMove(
      "r1bqkb1r/pppp1ppp/2n1pn2/8/3P4/2N2N2/PPP1PPPP/R1BQKB1R w KQkq - 0 4",
      "c3d5",
    ),
  ).toBe(false);
});

describe("insteadFrame names the mechanism the try missed", () => {
  // Real Lichess positions from the teachable-moments KPI set.
  const closing = (fen: string, best: string[], played: string[]) => {
    const learner = new Chess(fen).turn();
    const [tried] = lineStoryboard(fen, played, learner);
    return insteadFrame(fen, best, learner, tried);
  };

  it("an uncovered attack", () => {
    expect(
      closing(
        "r1B5/2k1np2/1pnp2pq/2p1p1N1/4P3/pPNP4/P1PQ1PP1/2K5 w - - 0 20",
        ["g5e6", "f7e6", "d2h6", "a8c8", "f2f4", "c7d7"],
        ["c8h3", "h6h4", "c3b5", "c7b8"],
      ),
    ).toMatchObject({
      caption:
        "Ne6+ uncovers your queen's attack on my queen, so after fxe6 you take it with Qxh6.",
      arrows: [
        { from: "d2", to: "h6", kind: "attack" },
        { from: "f7", to: "e6", kind: "reply" },
      ],
      outlines: [{ square: "h6", tone: "coral" }],
    });
  });

  it("a piece with no defender", () => {
    expect(
      closing(
        "3r1rk1/pp3ppp/2p1p3/7n/2BP1q2/2P4P/P1P1QP2/R3R2K w - - 2 23",
        ["e2h5", "f4f2", "e1e2", "f2f4", "h1g2", "c6c5"],
        ["e1g1", "h5f6", "g1g3", "c6c5"],
      )?.caption,
    ).toBe("Qxh5 takes my knight, which has no defender.");
  });

  it("a check that gains the time to take", () => {
    expect(
      closing(
        "7r/1N1nkppp/4pn2/3p4/6b1/5N2/qPP1Q1PP/2KR1B1R b - - 0 15",
        ["a2a1", "c1d2", "a1b2", "e2a6", "f6e4", "d2e3"],
        ["h8b8", "e2a6", "a2a6", "f1a6"],
      ),
    ).toMatchObject({
      caption: "Qa1+ gives check, so after Kd2 you take the pawn with Qxb2.",
      outlines: [
        { square: "c1", tone: "coral" },
        { square: "b2", tone: "coral" },
      ],
    });
  });

  it("a threat on the piece it then takes", () => {
    expect(
      closing(
        "r7/1ppk1p2/2np2rp/p1b1p3/1PP4B/P2P1PPq/4BP1P/R2Q1RK1 b - - 0 16",
        ["c5d4", "g1h1", "d4a1", "d1a1", "a5b4", "f3f4"],
        ["c5a7", "g1h1", "a7d4", "a1c1"],
      )?.caption,
    ).toBe(
      "Bd4 threatens to win my rook on a1, so after Kh1 you take the rook with Bxa1.",
    );
  });
});
