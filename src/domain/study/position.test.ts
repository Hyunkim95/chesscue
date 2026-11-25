import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import {
  boardFacts,
  buildRequestedSetup,
  cutoffFen,
  cutoffLayout,
  editPosition,
  isStudyPosition,
  validStudyAnswer,
} from "./position";
import {
  courses,
  libraryRoadmap,
  roadmapSchema,
  verifyGameScore,
} from "./roadmap";
describe("study positions", () => {
  it("requires the actual source game to reach each lesson and historical continuation", () => {
    const score =
      "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0";
    expect(verifyGameScore("attack", score)?.at(-1)).toEqual("Qb8+ Nxb8 Rd8#");
    expect(verifyGameScore("rook", score)).toBeNull();
    expect(
      verifyGameScore("attack", score.split("17. Rd8#")[0] ?? ""),
    ).toBeNull();
  });
  it("replays every sourced continuation and roundtrips each versioned bundle", () => {
    for (const topic of ["rook", "attack"] as const) {
      expect(roadmapSchema.parse(libraryRoadmap(topic))).toEqual(
        libraryRoadmap(topic),
      );
      for (const l of courses[topic].lessons) {
        expect(isStudyPosition(l.fen)).toBe(true);
        const board = new Chess(l.fen);
        for (const san of l.continuation) expect(board.move(san).san).toBe(san);
      }
    }
  });
  it("keeps explicit square requests even when Nano proposes a different layout", () => {
    const fen = buildRequestedSetup(
      cutoffLayout,
      "Set up a rook ending with the white king on b2 and the black king on g7",
    );
    expect(fen).toBe(editPosition(cutoffFen, "a2", "b2"));
  });
  it("rejects missing kings, adjacent kings, invalid edits and impossible check states", () => {
    expect(editPosition(cutoffFen, "a2", "g8")).toBeNull();
    expect(editPosition(cutoffFen, "a2", "h2")).toBeNull();
    expect(
      buildRequestedSetup(
        "white king on a1, white rook on g1, black king on g8",
        "",
      ),
    ).toBeNull();
    expect(buildRequestedSetup("white king on a1", "")).toBeNull();
    expect(
      buildRequestedSetup(
        "white king on a1, black king on h8, white queen on d4",
        "rook ending",
      ),
    ).toBeNull();
  });
  it("uses legal engine lines and reports the pieces controlling requested squares", () => {
    const facts = boardFacts(cutoffFen, ["a2b2", "a1h8"], "Who covers d2?");
    expect(facts.engineLine).toEqual(["Kb2"]);
    expect(facts.squareControl).toContain(
      "Black covers d2 with the rook on d6.",
    );
    expect(validStudyAnswer("Consider the rook on d6.", facts)).toBe(true);
    expect(validStudyAnswer("Play Qxh8 for mate in two.", facts)).toBe(false);
  });
});
