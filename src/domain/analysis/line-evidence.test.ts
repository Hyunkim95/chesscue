import { describe, expect, it } from "vitest";

import { lineEvidence } from "./line-evidence";

describe("lineEvidence", () => {
  it("records a knight check that also attacks an undefended rook", () => {
    const evidence = lineEvidence("r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1", [
      "d5c7",
      "e8d7",
      "c7a8",
    ]);

    expect(evidence.ok && evidence.facts).toEqual(
      expect.arrayContaining([
        "check",
        "double-attack",
        "then-capture-undefended",
        "wins-major-material",
      ]),
    );
  });

  it("records a rook mate along the king's home rank", () => {
    const evidence = lineEvidence("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", [
      "a1a8",
    ]);

    expect(evidence).toEqual({
      ok: true,
      facts: [
        "mate",
        "mate-along-rank",
        "mate-by-r",
        "mate-home-rank",
        "mate-self-blocked",
      ],
    });
  });

  it("records a capture the pinned defender cannot answer", () => {
    // The h7 pawn guards g6 but is pinned to the king by the h4 queen.
    const evidence = lineEvidence("7k/7p/6n1/6R1/7Q/8/8/6K1 w - - 0 1", [
      "g5g6",
    ]);

    expect(evidence.ok && evidence.facts).toContain("defender-pinned");
  });

  it("rejects empty and illegal lines", () => {
    const fen = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
    expect(lineEvidence(fen, [])).toEqual({ ok: false, reason: "empty-line" });
    expect(lineEvidence(fen, ["e1e3"])).toEqual({
      ok: false,
      reason: "illegal-line",
    });
  });
});
