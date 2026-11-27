import { expect, it } from "vitest";

import { replyReason, rookMoveReason, tierLine } from "./moment-copy";

// Why Rook could take, not just what he took.
it("says the player's move left the piece with no defender", () => {
  expect(
    rookMoveReason("4k3/3q4/8/5B2/8/8/8/4K3 b - - 1 1", "d7f5", {
      fen: "4k3/3q4/8/8/8/8/2B5/4K3 w - - 0 1",
      uci: "c2f5",
    }),
  ).toBe("Bf5 puts your bishop on f5, where nothing defends it, so I take it.");
});

it("says the player's move took away the last defender", () => {
  expect(
    rookMoveReason("4k3/3q4/8/1N3B2/8/8/8/4K3 b - - 1 1", "d7f5", {
      fen: "4k3/3q4/8/5B2/3N4/8/8/4K3 w - - 0 1",
      uci: "d4b5",
    }),
  ).toBe("Nb5 took away the last defender of your bishop on f5, so I take it.");
});

it("calls a capture on the square just taken a recapture", () => {
  expect(
    replyReason("4k3/3q4/8/5B2/8/8/8/4K3 b - - 0 1", "d7f5", {
      fen: "4k3/3q4/8/5n2/8/3B4/8/4K3 w - - 0 1",
      uci: "d3f5",
    }),
  ).toBe("I take back on f5.");
});

it("says a piece with no defender is taken for free", () => {
  expect(rookMoveReason("4k3/3q4/8/5B2/8/8/8/4K3 b - - 1 1", "d7f5")).toBe(
    "Nothing defends your bishop on f5, so I take it for free.",
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
