import { describe, expect, it } from "vitest";

import { whyProblems } from "./validate-why";
import cases from "./why-packet.fixture.json";
import { standing, whyPacket, whySearches, type WhyInput } from "./why-packet";

// The 20 positions of the round 2 "why" test (10 from the KPI games, 10
// fresh Lichess puzzles), with the Stockfish lines the research packets were
// built from. research_notes/why-explanations/scorecard.md.
function built(id: string) {
  const found = cases.find((entry) => entry.id === id);
  if (!found) throw new Error(`no case ${id}`);
  const input: WhyInput = found.input;
  return {
    input,
    packet: whyPacket(input, new Map(Object.entries(found.lines))),
    expected: found.expected,
  };
}

describe("whyPacket", () => {
  it.each(cases.map(({ id }) => id))(
    "builds the packet the round 2 writers were graded on (%s)",
    (id) => {
      const { packet, expected } = built(id);
      expect(packet).toEqual(expected);
    },
  );

  it("names the piece that pins the only defender", () => {
    const { packet } = built("k27");
    expect(packet?.bestMoveCaptures).toEqual({
      takes: "the bishop on h4",
      isRecapture: false,
      canTakeBack: [],
      attackersThatArePinned: [{ piece: "pawn on g3", pinnedBy: "rook on g6" }],
    });
  });

  it("marks a best move that takes back a piece", () => {
    const { packet } = built("k20");
    expect(packet?.bestMoveCaptures?.isRecapture).toBe(true);
    expect(packet?.yourGameMove?.move).toBe("Rxf6");
  });

  it("asks what a quiet move threatens, the defences and the game move", () => {
    expect(whySearches(built("k27").input).map(({ key }) => key)).toEqual([
      "threat",
      "defences",
      "game",
    ]);
  });

  it("asks no threat after a check", () => {
    expect(whySearches(built("f-0wo6p").input).map(({ key }) => key)).toEqual([
      "defences",
      "game",
    ]);
  });

  it("asks how each other recapture goes", () => {
    expect(whySearches(built("k20").input).map(({ key }) => key)).toEqual(
      expect.arrayContaining(["recapture:f8f6", "game"]),
    );
  });

  it("writes counts as fragments", () => {
    expect(standing(3)).toBe("3 points ahead");
    expect(standing(-1)).toBe("1 point behind");
    expect(standing(0)).toBe("level");
  });
});

describe("whyProblems", () => {
  const { packet } = built("k27");
  if (!packet) throw new Error("no packet");

  it("accepts Flash's round 2 answer once counts are fragments", () => {
    expect(
      whyProblems(
        "Qxh4 wins the bishop on h4 for free, because the pawn on g3 is pinned by your rook on g6 and cannot take back. Even after White's best defence, f4, you are 2 points ahead.",
        packet,
      ),
    ).toEqual([]);
  });

  it.each([
    [
      "a move not in the packet",
      "Qxh4 wins a bishop, then Qh2 is mate.",
      "move Qh2",
    ],
    [
      "a piece that is not there",
      "Qxh4 wins the knight on h4.",
      "knight on h4",
    ],
    [
      "its own count",
      "Qxh4 leaves you 5 points ahead.",
      "count 5 points ahead",
    ],
    ["a count in pieces", "Qxh4 leaves you a piece ahead.", "own count"],
    [
      "the wrong pinning piece",
      "The pawn on g3 is pinned by your bishop.",
      "pinned by bishop",
    ],
    ["unstoppable", "Qxh4 starts an unstoppable attack.", "unstoppable"],
    ["forced without mate", "Qxh4 forces White to give up a bishop.", "forced"],
  ])("rejects %s", (_, text, problem) => {
    expect(whyProblems(text, packet)).toContain(problem);
  });

  it("rejects free when the capture can be taken back", () => {
    const recapture = built("k20").packet;
    if (!recapture) throw new Error("no packet");
    expect(
      whyProblems("Bxf6 wins the bishop on f6 for free.", {
        ...recapture,
        bestMoveCaptures: recapture.bestMoveCaptures && {
          ...recapture.bestMoveCaptures,
          canTakeBack: ["pawn on g7"],
        },
      }),
    ).toContain("free");
  });
});
