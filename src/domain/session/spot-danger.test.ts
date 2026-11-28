import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { dangerFacts } from "../analysis/danger-facts";

import {
  advanceSpot,
  dangerLabel,
  dangerMarks,
  dangerMoment,
  spotHint,
  spotLine,
  startSpot,
  type DangerMoment,
  type SpotEvent,
  type SpotState,
} from "./spot-danger";

// The approved mock's position, from a Lichess game: Black to move after
// White's Nxd4. In the game Black played Be5, and White took on c6, then the
// rook on d8. Stockfish 19 lite, depth 16, prefers Bb4+.
const FEN = "2kr3r/1pp2pp1/p1nbqn2/3p3p/3N4/1P2P1P1/PBP2PBP/R2QK2R b KQ - 0 13";
const BEST = "d6b4 e1f1 c6d4 d1d4 b4d6 h2h4 c8b8 c2c4".split(" ");
const GAME = ["d6e5", "d4c6", "e5b2", "c6d8", "b2a1", "d1a1"];
const NXD4 = { uci: "f3d4", san: "Nxd4" };

function danger(): DangerMoment {
  const moment = dangerMoment({
    fen: FEN,
    solutionLine: BEST,
    lastMove: NXD4,
    gameLine: GAME,
  });
  if (!moment) throw new Error("Expected the spot-the-danger format");
  return moment;
}

const run = (moment: DangerMoment, ...events: SpotEvent[]): SpotState =>
  events.reduce<SpotState>(
    (state, event) => advanceSpot(moment, FEN, state, event),
    startSpot,
  );

describe("dangerMoment", () => {
  it("asks about the move just played and says what happened in the game", () => {
    const moment = danger();
    expect(moment.question).toBe(
      "White just played Nxd4. Is something of yours in trouble?",
    );
    expect(moment.lastMoveUci).toBe("f3d4");
    expect(moment.facts[0]?.id).toBe("wins-material:e6");
    expect(moment.gameCaption).toBe(
      "In your game, after Be5, White plays Nxc6, taking your knight on c6.",
    );
  });

  it("applies to a mate the player's move left on the board", () => {
    // Black threatens Re1#; Kh1 leaves it, h3 would have made room.
    const moment = dangerMoment({
      fen: "4r1k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1",
      solutionLine: ["h2h3"],
      lastMove: { uci: "e2e8", san: "Re8" },
      gameLine: ["g1h1", "e8e1"],
    });
    expect(moment?.question).toBe(
      "Black just played Re8. Is something of yours in trouble?",
    );
    expect(
      moment &&
        spotLine(moment, "4r1k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1", {
          kind: "spotted",
          factId: "mate-threat:e8e1",
        }),
    ).toMatch(/^Yes\. Black threatens Re1#, checkmate\. In your game/);
    expect(moment && dangerMarks(moment, "mate-threat:e8e1")).toEqual({
      arrows: [{ from: "e8", to: "e1" }],
      targets: ["g1"],
    });
  });

  it("does not apply when the game move dealt with the danger", () => {
    expect(
      dangerMoment({
        fen: FEN,
        solutionLine: BEST,
        lastMove: NXD4,
        gameLine: ["e6e7", "d4c6"],
      }),
    ).toBeUndefined();
  });

  it("does not apply when the player found the best move", () => {
    expect(
      dangerMoment({
        fen: FEN,
        solutionLine: BEST,
        lastMove: NXD4,
        gameLine: ["d6b4", "e1f1"],
      }),
    ).toBeUndefined();
  });

  it("does not apply when the better line is the player's own tactic", () => {
    // Ng5+ forks the king and queen; Black's rook can take the bishop on c5.
    expect(
      dangerMoment({
        fen: "2r5/5k2/4q3/1rBp2p1/p2P1p2/PpR1PNPp/1P2KP1P/2R5 w - - 0 35",
        solutionLine: ["f3g5", "f7f6", "g5e6"],
        lastMove: { uci: "c7c8", san: "Rc8" },
        gameLine: ["g3f4", "b5c5"],
      }),
    ).toBeUndefined();
  });

  it("leaves a pawn that can be taken to the moment's own goal", () => {
    // Two Knights: 4...h6? lets Nxf7, but f7 alone is a pawn.
    expect(
      dangerMoment({
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4",
        solutionLine: ["d7d5", "e4d5", "c6a5"],
        lastMove: { uci: "f3g5", san: "Ng5" },
        gameLine: ["h7h6", "g5f7"],
      }),
    ).toBeUndefined();
  });

  it("leaves a position in check to getting out of check", () => {
    // Fried Liver, 12. Nxc7+: the knight checks and hits the rook on a8.
    const board = new Chess();
    for (const san of "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3 Nb4 a3 Nxc2+ Kd1 Nxa1 Nxd5 Qh4 Nxc7+".split(
      " ",
    ))
      board.move(san);
    expect(board.inCheck()).toBe(true);
    expect(dangerFacts(board.fen())?.[0]?.target).toBe("a8");
    expect(
      dangerMoment({
        fen: board.fen(),
        solutionLine: ["e6d6"],
        lastMove: { uci: "d5c7", san: "Nxc7+" },
        gameLine: ["e6d7", "f3f7"],
      }),
    ).toBeUndefined();
  });

  it("needs the opponent's last move", () => {
    expect(
      dangerMoment({
        fen: FEN,
        solutionLine: BEST,
        lastMove: undefined,
        gameLine: GAME,
      }),
    ).toBeUndefined();
  });
});

describe("advanceSpot", () => {
  it("spots the danger when the player taps the piece that can be won", () => {
    const moment = danger();
    const spotted = run(moment, { kind: "tap", square: "e6" });
    expect(spotted).toEqual({ kind: "spotted", factId: "wins-material:e6" });
    expect(spotLine(moment, FEN, spotted)).toBe(
      "Yes. White threatens Nxe6, winning your queen for a knight. " +
        "In your game, after Be5, White plays Nxc6, taking your knight on c6.",
    );
    // Arrows from the knight to everything it hits, outlines on them.
    expect(dangerMarks(moment, "wins-material:e6")).toEqual({
      arrows: [
        { from: "d4", to: "e6" },
        { from: "d4", to: "c6" },
      ],
      targets: ["e6", "c6"],
    });
    expect(
      run(moment, { kind: "tap", square: "e6" }, { kind: "find" }),
    ).toEqual({ kind: "finding" });
    expect(spotLine(moment, FEN, { kind: "finding" })).toBe(
      "Play it on the board. I'll answer with White's best reply.",
    );
  });

  it("nudges a partial answer toward the bigger danger", () => {
    const moment = danger();
    const partial = run(moment, { kind: "tap", square: "c6" });
    expect(partial).toEqual({
      kind: "nudged",
      cause: { kind: "safe-attacked", factId: "attacked-but-safe:c6" },
    });
    expect(spotLine(moment, FEN, partial)).toBe(
      "True, your knight on c6 is attacked. Something bigger is too. Follow the knight's other jumps.",
    );
    // A typed answer about the same piece gets the same line.
    expect(
      run(moment, { kind: "read", factId: "attacked-but-safe:c6" }),
    ).toEqual(partial);
  });

  it("spots the same danger by description or by tapping", () => {
    const moment = danger();
    const described = run(moment, { kind: "read", factId: "wins-material:e6" });
    expect(described).toEqual(run(moment, { kind: "tap", square: "e6" }));
    expect(
      run(
        moment,
        { kind: "read", factId: "wins-material:e6" },
        { kind: "find" },
      ),
    ).toEqual({ kind: "finding" });
  });

  it("answers taps elsewhere and typed answers that match nothing", () => {
    const moment = danger();
    expect(
      spotLine(moment, FEN, run(moment, { kind: "tap", square: "f6" })),
    ).toBe("Your knight on f6 is safe for now. Something else is in trouble.");
    expect(
      spotLine(moment, FEN, run(moment, { kind: "tap", square: "d4" })),
    ).toBe("Tap one of your own pieces: the one you'd worry about.");
    expect(
      spotLine(moment, FEN, run(moment, { kind: "read", factId: undefined })),
    ).toBe(
      "Not quite. Look at each of your pieces. Could White win one of them?",
    );
    // An id that is not one of the position's facts counts as none.
    expect(run(moment, { kind: "read", factId: "wins-material:a1" })).toEqual({
      kind: "nudged",
      cause: { kind: "none" },
    });
  });

  it("ignores taps once the danger is spotted", () => {
    const moment = danger();
    expect(
      run(moment, { kind: "tap", square: "e6" }, { kind: "tap", square: "c6" }),
    ).toEqual({ kind: "spotted", factId: "wins-material:e6" });
  });
});

describe("labels and hints", () => {
  it("names the fact a model matched", () => {
    const moment = danger();
    const fact = (id: string) => moment.facts.find((entry) => entry.id === id);
    expect(dangerLabel(fact("attacked-but-safe:c6"))).toBe(
      "knight on c6 attacked",
    );
    expect(dangerLabel(fact("wins-material:e6"))).toBe(
      "queen on e6 can be won",
    );
    expect(dangerLabel(undefined)).toBe("no danger named");
  });

  it("points the hint at the attacker, never the target", () => {
    expect(spotHint(danger(), FEN)).toEqual({
      text: "Look at White's knight on d4. What could it do next?",
      square: "d4",
    });
  });
});
