import { expect, it } from "vitest";

import {
  captureReasonFromBoard,
  replyReason,
  rookMoveReason,
  sacrificeSentence,
  tierLine,
} from "./moment-copy";

// Why Rook could take, not just what he took.
it("says the player's move left the piece with no defender", () => {
  expect(
    rookMoveReason("4k3/3q4/8/5B2/8/8/8/4K3 b - - 1 1", "d7f5", {
      fen: "4k3/3q4/8/8/8/8/2B5/4K3 w - - 0 1",
      uci: "c2f5",
    }),
  ).toBe("Bf5 puts your bishop on f5, where nothing defends it.");
  // With Stockfish's line showing Rook keeps the bishop, the "so" is earned.
  expect(
    rookMoveReason(
      "4k3/3q4/8/5B2/8/8/8/4K3 b - - 1 1",
      "d7f5",
      { fen: "4k3/3q4/8/8/8/8/2B5/4K3 w - - 0 1", uci: "c2f5" },
      ["e1d1"],
    ),
  ).toBe("Bf5 puts your bishop on f5, where nothing defends it, so I take it.");
});

it("says the player's move took away the last defender", () => {
  expect(
    rookMoveReason("4k3/3q4/8/1N3B2/8/8/8/4K3 b - - 1 1", "d7f5", {
      fen: "4k3/3q4/8/5B2/3N4/8/8/4K3 w - - 0 1",
      uci: "d4b5",
    }),
  ).toBe("Nb5 took away the last defender of your bishop on f5.");
});

it("calls a capture on the square just taken a recapture", () => {
  expect(
    replyReason("4k3/3q4/8/5B2/8/8/8/4K3 b - - 0 1", "d7f5", {
      fen: "4k3/3q4/8/5n2/8/3B4/8/4K3 w - - 0 1",
      uci: "d3f5",
    }),
  ).toBe("I take back on f5.");
});

it("says a piece is free only when Stockfish's line backs it", () => {
  const fen = "4k3/3q4/8/5B2/8/8/8/4K3 b - - 1 1";
  expect(rookMoveReason(fen, "d7f5")).toBe(
    "Nothing defends your bishop on f5.",
  );
  expect(rookMoveReason(fen, "d7f5", undefined, ["e1d1"])).toBe(
    "Nothing defends your bishop on f5, so I take it for free.",
  );
});

it("claims no free capture when the line shows it costs more", () => {
  // Qxf5 takes an undefended bishop, but the line has White win the queen.
  const fen = "4k3/3q4/8/5B2/8/8/5Q2/4K3 b - - 1 1";
  expect(rookMoveReason(fen, "d7f5", undefined, ["f2f5"])).not.toMatch(
    /for free|so I take/,
  );
});

it("explains a trade by where the line goes", () => {
  // The player's own game: after ...Bf5, Nxc5 dxc5 Qxb7 Be4.
  const afterBf5 =
    "rn1q1rk1/ppp2ppp/3p1n2/2b1Nb2/N1P5/1Q6/PP1PPPPP/R1B1KB1R w KQ - 1 8";
  expect(
    rookMoveReason(afterBf5, "a4c5", undefined, ["d6c5", "b3b7", "f5e4"]),
  ).toBe("Nxc5 starts a line where I win a bishop and a pawn for a knight.");
  expect(rookMoveReason(afterBf5, "a4c5", undefined, ["d6c5"])).toBe(
    "Nxc5 trades my knight for your bishop.",
  );
});

it("keeps Rook's I and the move's capitals in a preview", () => {
  expect(
    tierLine({
      tier: "missed",
      trySan: "Na6",
      replySan: "Nf3",
      preview: true,
      plan: true,
    }),
  ).toMatch(/^If you play Na6, I answer Nf3\./);
});

it("says what Rook's sacrifice costs and wins", () => {
  // The player's game: ...Bf5 hits the queen; Qxf5 Qxf5 dxc5.
  const afterBf5 =
    "r3r1k1/ppp2ppp/3p1q2/2n2bN1/N1PP4/8/PPQ1P1PP/R1B1KB1R w KQ - 1 14";
  expect(sacrificeSentence(afterBf5, ["c2f5", "f6f5", "d4c5"])).toBe(
    "So I take your bishop instead. It costs me a queen, but I get a bishop and a knight for her.",
  );
  // From the board alone there is no reason to give up the queen.
  expect(
    captureReasonFromBoard(afterBf5, "c2f5", undefined, ["f6f5", "d4c5"]),
  ).toBeUndefined();
});
