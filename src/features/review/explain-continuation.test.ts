import { Chess } from "chess.js";
import { expect, it } from "vitest";
import {
  explainBetterMove,
  explainComparedMove,
  explainContinuation,
} from "./explain-continuation";

it("explains what a quiet developing move opens", () => {
  const board = new Chess();
  const move = board.move("e4");
  expect(explainContinuation(move, board)).toMatch(
    /opens a line for the (bishop|queen)/,
  );
});

it("explains a pin and distinguishes it from a plain attack", () => {
  for (const [king, pinned] of [
    ["e8", true],
    ["g8", false],
  ] as const) {
    const board = new Chess(
      king === "e8"
        ? "4k3/8/2n5/8/8/8/5PPP/4KB2 w - - 0 1"
        : "6k1/8/2n5/8/8/8/5PPP/4KB2 w - - 0 1",
    );
    const move = board.move("Bb5");
    expect(
      explainContinuation(move, board).includes(
        "pins the knight on c6 to its king",
      ),
    ).toBe(pinned);
  }
});

it("links a reply to the defender the learner moved away", () => {
  const board = new Chess("1k6/4r3/8/8/8/4R3/3B4/6K1 w - - 0 1");
  const player = board.move("Ba5");
  const reply = board.move("Rxe3");
  expect(explainContinuation(reply, board, player)).toContain(
    "Moving your bishop off d2 left the rook on e3 without a defender.",
  );
});

it("counts a legal king recapture when the defender still covers the square", () => {
  const board = new Chess("1k6/8/8/4r3/8/8/4R3/4K3 w - - 0 1");
  const player = board.move("Kd1");
  const reply = board.move("Rxe2");
  expect(explainContinuation(reply, board, player)).toContain(
    "White can immediately recapture on e2",
  );
});

it("explains a modest opening edge using the center squares covered in each checked line", () => {
  const game = new Chess();
  const alternative = new Chess();
  const played = game.move("a3");
  const found = alternative.move("Nc3");
  const comparison = explainBetterMove({
    played,
    found,
    playedLine: [game.move("e5")],
    foundLine: [alternative.move("e5")],
    playedReplyScore: 12,
    foundReplyScore: -27,
    gain: 39,
    opening: true,
  });
  expect(comparison).toContain("0.39-point edge over a3");
  expect(comparison).toContain("cover e4 and d5");
});

it("explains the different captures and checked recaptures as the comparison switches", () => {
  const fen = "8/3n4/1k1b4/p2p3N/3N1p2/2rp2p1/8/3K4 w - - 0 53";
  const original = new Chess(fen);
  const better = new Chess(fen);
  const gameMove = original.move("Nxf4");
  const betterMove = better.move("Nxg3");

  expect(explainComparedMove(gameMove, betterMove, original.move("Bxf4"))).toBe(
    "Nxf4 takes the pawn on f4 and attacks d5. Black’s bishop can take your knight back with Bxf4.",
  );
  expect(explainComparedMove(betterMove, gameMove, better.move("fxg3"))).toBe(
    "Nxg3 takes the pawn on g3 and attacks e4. Black’s pawn can take your knight back with fxg3.",
  );
});

it("prioritizes a checked mate over an incidental square attack", () => {
  const fen = "r1b1r3/ppp1kpQ1/3pq3/8/N1PP4/8/PP2P1PP/R1B1KB1R b - - 0 10";
  const original = new Chess(fen);
  const better = new Chess(fen);
  const played = original.move("Bd7");
  const found = better.move("Kd8");
  expect(
    explainComparedMove(played, found, original.move("Bg5+"), {
      selected: 99998,
      other: 1050,
    }),
  ).toBe(
    "Stockfish finds a forced mate for White after Bd7, starting with Bg5+.",
  );
  expect(
    explainComparedMove(found, played, better.move("Bg5+"), {
      selected: 1050,
      other: 99998,
    }),
  ).toBe(
    "This search found no forced mate for White after Kd8. Checked reply: Bg5+.",
  );
});

it("never says a piece gained the square it just left", () => {
  const board = new Chess("7R/8/8/7p/4k1p1/6P1/r7/5K2 w - - 4 74");
  const move = board.move("Rb8");
  const text = explainContinuation(move, new Chess(move.after));
  expect(text).not.toMatch(/covers h8/);
  expect(text).toMatch(/^From b8, the rook now covers b7\./);
});
