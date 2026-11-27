import { describe, expect, it } from "vitest";

import { dangerFacts } from "./danger-facts";

describe("dangerFacts", () => {
  it("puts the queen the knight can win ahead of the knight that is safe", () => {
    // Lichess game, Black to move after White's Nxd4.
    const fen =
      "2kr3r/1pp2pp1/p1nbqn2/3p3p/3N4/1P2P1P1/PBP2PBP/R2QK2R b KQ - 0 13";
    const facts = dangerFacts(fen) ?? [];
    expect(facts[0]).toMatchObject({
      kind: "wins-material",
      target: "e6",
      attackers: ["d4"],
      text: "The knight on d4 can win your queen on e6.",
    });
    expect(facts).toContainEqual(
      expect.objectContaining({
        kind: "attacked-but-safe",
        target: "c6",
        text: "The knight on d4 attacks your knight on c6, but taking it wins nothing.",
      }),
    );
  });

  it("says when the target has no defender", () => {
    const fen = "4k3/8/8/3n4/8/8/8/2B1K3 w - - 0 1";
    expect(dangerFacts("4k3/8/5b2/8/8/8/8/R3K3 w - - 0 1")?.[0]).toMatchObject({
      kind: "wins-material",
      target: "a1",
    });
    expect(dangerFacts(fen)).toEqual([]);
  });

  it("finds a mate-in-one threat", () => {
    // White's back rank: Black threatens Re1 mate.
    const fen = "4r1k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1";
    expect(dangerFacts(fen)?.[0]).toMatchObject({
      kind: "mate-threat",
      target: "g1",
      attackers: ["e8"],
      text: "The rook on e8 threatens mate with Re1#.",
    });
  });

  it("rejects an invalid position", () => {
    expect(dangerFacts("not a fen")).toBeUndefined();
  });
});
