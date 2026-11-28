import { describe, expect, it } from "vitest";

import { hintOptions } from "./hint-options";

// Lichess game, Black to move after White's Nxd4: the knight hits the queen
// on e6 (wins material) and the knight on c6 (safe).
const QUEEN_LOOSE =
  "2kr3r/1pp2pp1/p1nbqn2/3p3p/3N4/1P2P1P1/PBP2PBP/R2QK2R b KQ - 0 13";

describe("hintOptions", () => {
  it("offers the three hints for the mock position, with code-written words", () => {
    const options = hintOptions(QUEEN_LOOSE) ?? [];
    expect(options.map((o) => o.id)).toEqual([
      "check-their-threats",
      "bigger-target",
      "scan",
    ]);
    expect(options[0]?.text).toBe(
      "Before you attack, check what White threatens.",
    );
    expect(options[1]).toMatchObject({
      text: "True: the knight on d4 attacks your knight on c6, but taking it wins nothing. Something bigger is attacked too. Follow the knight's other jumps.",
      arrows: [],
      outlined: ["d4"],
    });
  });

  it("draws threat arrows without singling out the answer", () => {
    const [threats] = hintOptions(QUEEN_LOOSE) ?? [];
    expect(threats?.arrows).toEqual(
      expect.arrayContaining([
        ["d4", "e6"],
        ["d4", "c6"],
      ]),
    );
    expect(threats?.outlined).toEqual([]);
  });

  it("falls back to the scan alone when nothing is in danger", () => {
    const quiet = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(hintOptions(quiet)?.map((o) => o.id)).toEqual(["scan"]);
  });

  it("rejects an invalid position", () => {
    expect(hintOptions("not a fen")).toBeUndefined();
  });
});
